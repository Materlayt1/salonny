-- Dynamic customer profile settings and privacy-safe self-service data.

create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  recipient_name text not null check (char_length(recipient_name) between 2 and 120),
  phone text,
  address_line text not null check (char_length(address_line) between 5 and 300),
  district text not null check (char_length(district) between 1 and 100),
  city text not null check (char_length(city) between 1 and 100),
  postal_code text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_addresses_one_default_idx
  on public.user_addresses(user_id) where is_default;
create index if not exists user_addresses_user_idx on public.user_addresses(user_id, created_at desc);

create or replace function public.set_default_user_address(p_address_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_addresses
    where id = p_address_id and user_id = auth.uid()
  ) then
    raise exception 'address_not_found';
  end if;

  update public.user_addresses set is_default = false
  where user_id = auth.uid() and is_default;
  update public.user_addresses set is_default = true
  where id = p_address_id and user_id = auth.uid();
end;
$$;

-- Only provider-safe display metadata lives here. Raw card number/CVV is never stored.
create table if not exists public.customer_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  brand text not null,
  last_four char(4) not null check (last_four ~ '^[0-9]{4}$'),
  expiry_month smallint check (expiry_month between 1 and 12),
  expiry_year smallint,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists customer_payment_methods_one_default_idx
  on public.customer_payment_methods(user_id) where is_default;
create index if not exists customer_payment_methods_user_idx
  on public.customer_payment_methods(user_id, created_at desc);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  category text not null check (category in ('booking', 'payment', 'business', 'account', 'other')),
  subject text not null check (char_length(subject) between 3 and 140),
  message text not null check (char_length(message) between 10 and 3000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_user_idx on public.support_tickets(user_id, created_at desc);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  reason text check (char_length(reason) <= 1000),
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed', 'rejected')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists account_deletion_requests_open_idx
  on public.account_deletion_requests(user_id) where status in ('requested', 'processing');

drop trigger if exists user_addresses_touch on public.user_addresses;
create trigger user_addresses_touch before update on public.user_addresses
  for each row execute function public.touch_updated_at();
drop trigger if exists support_tickets_touch on public.support_tickets;
create trigger support_tickets_touch before update on public.support_tickets
  for each row execute function public.touch_updated_at();

alter table public.user_addresses enable row level security;
alter table public.customer_payment_methods enable row level security;
alter table public.support_tickets enable row level security;
alter table public.account_deletion_requests enable row level security;

drop policy if exists user_addresses_self on public.user_addresses;
create policy user_addresses_self on public.user_addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists customer_payment_methods_self_read on public.customer_payment_methods;
create policy customer_payment_methods_self_read on public.customer_payment_methods for select to authenticated
  using (user_id = auth.uid());
drop policy if exists customer_payment_methods_self_delete on public.customer_payment_methods;
create policy customer_payment_methods_self_delete on public.customer_payment_methods for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists support_tickets_self_read on public.support_tickets;
create policy support_tickets_self_read on public.support_tickets for select to authenticated
  using (user_id = auth.uid());
drop policy if exists support_tickets_self_insert on public.support_tickets;
create policy support_tickets_self_insert on public.support_tickets for insert to authenticated
  with check (user_id = auth.uid() and status = 'open');

drop policy if exists account_deletion_requests_self_read on public.account_deletion_requests;
create policy account_deletion_requests_self_read on public.account_deletion_requests for select to authenticated
  using (user_id = auth.uid());
drop policy if exists account_deletion_requests_self_insert on public.account_deletion_requests;
create policy account_deletion_requests_self_insert on public.account_deletion_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'requested' and processed_at is null);

grant select, insert, update, delete on public.user_addresses to authenticated;
grant execute on function public.set_default_user_address(uuid) to authenticated;
grant select, delete on public.customer_payment_methods to authenticated;
grant select, insert on public.support_tickets to authenticated;
grant select, insert on public.account_deletion_requests to authenticated;
