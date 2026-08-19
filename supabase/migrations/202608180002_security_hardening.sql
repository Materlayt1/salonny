-- Close the remaining Advisor findings on public lookup tables and trigger helpers.

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

revoke all on function public.touch_updated_at() from public;
revoke all on function public.handle_new_auth_user() from public;

alter table public.business_categories enable row level security;
alter table public.appointment_statuses enable row level security;
alter table public.subscription_plans enable row level security;

drop policy if exists business_categories_public_read on public.business_categories;
create policy business_categories_public_read on public.business_categories
for select to anon, authenticated using (true);

drop policy if exists appointment_statuses_public_read on public.appointment_statuses;
create policy appointment_statuses_public_read on public.appointment_statuses
for select to anon, authenticated using (true);

drop policy if exists subscription_plans_public_read on public.subscription_plans;
create policy subscription_plans_public_read on public.subscription_plans
for select to anon, authenticated using (true);
