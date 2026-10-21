-- Package writes stay tenant-bound even when a client calls PostgREST directly.
-- This is a deployment prerequisite, not applied automatically by the mobile app.
-- Keep the whole change atomic; never repair/delete existing customer data here.
begin;

do $$
begin
  if exists (
    select 1 from public.service_packages p
    left join public.services s on s.id=p.service_id and s.business_id=p.business_id
    where p.service_id is not null and s.id is null
  ) or exists (
    select 1 from public.customer_packages cp
    left join public.customers c on c.id=cp.customer_id and c.business_id=cp.business_id
    left join public.service_packages p on p.id=cp.package_id and p.business_id=cp.business_id
    where c.id is null or p.id is null
  ) then
    raise exception 'package_tenant_integrity_violation: existing cross-tenant references require an explicit administrator review; migration made no changes'
      using errcode='23514';
  end if;
end $$;

create unique index if not exists services_business_id_id_package_key on public.services(business_id,id);
create unique index if not exists customers_business_id_id_package_key on public.customers(business_id,id);
create unique index if not exists service_packages_business_id_id_package_key on public.service_packages(business_id,id);

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.service_packages'::regclass and conname='service_packages_tenant_service_fk') then
    alter table public.service_packages add constraint service_packages_tenant_service_fk
      foreign key(business_id,service_id) references public.services(business_id,id) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.customer_packages'::regclass and conname='customer_packages_tenant_customer_fk') then
    alter table public.customer_packages add constraint customer_packages_tenant_customer_fk
      foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.customer_packages'::regclass and conname='customer_packages_tenant_package_fk') then
    alter table public.customer_packages add constraint customer_packages_tenant_package_fk
      foreign key(business_id,package_id) references public.service_packages(business_id,id) on delete restrict not valid;
  end if;
end $$;
alter table public.service_packages validate constraint service_packages_tenant_service_fk;
alter table public.customer_packages validate constraint customer_packages_tenant_customer_fk;
alter table public.customer_packages validate constraint customer_packages_tenant_package_fk;

-- Replace (not duplicate) the old single-column relations. Two FKs to the same
-- table make existing PostgREST services(...)/customers(...) embeds ambiguous.
-- The compound replacements are already validated before any old FK is removed.
alter table public.service_packages drop constraint if exists service_packages_service_id_fkey;
alter table public.customer_packages drop constraint if exists customer_packages_customer_id_fkey;
alter table public.customer_packages drop constraint if exists customer_packages_package_id_fkey;

alter table public.service_packages enable row level security;
alter table public.customer_packages enable row level security;
drop policy if exists customer_packages_tenant on public.customer_packages;
drop policy if exists customer_packages_member_read on public.customer_packages;
drop policy if exists customer_packages_manager_read on public.customer_packages;
drop policy if exists customer_packages_manager_insert on public.customer_packages;
drop policy if exists customer_packages_manager_update on public.customer_packages;
drop policy if exists customer_packages_manager_delete on public.customer_packages;
-- A bare membership is insufficient: employees may have none/assigned customer
-- visibility. Package balances are a manager-only feature, including raw REST.
create policy customer_packages_manager_read on public.customer_packages for select to authenticated
  using (public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
create policy customer_packages_manager_insert on public.customer_packages for insert to authenticated
  with check (public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
create policy customer_packages_manager_update on public.customer_packages for update to authenticated
  using (public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]))
  with check (public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
create policy customer_packages_manager_delete on public.customer_packages for delete to authenticated
  using (public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
revoke insert,update,delete on public.customer_packages from anon;

-- The appointment trigger matches service_packages.service_id live. Changing the
-- service would silently change granted entitlements; quantity has no grant snapshot.
-- Immutable content also avoids check-then-write races with concurrent grant inserts.
-- Name, active flag and validity for future grants remain editable.
create or replace function public.guard_package_entitlement_definition()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.business_id is distinct from old.business_id
     or new.service_id is distinct from old.service_id
     or new.session_count is distinct from old.session_count then
    raise exception 'package_entitlement_definition_immutable: create a new package instead'
      using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists package_entitlement_definition_guard on public.service_packages;
create trigger package_entitlement_definition_guard before update of business_id,service_id,session_count on public.service_packages
  for each row execute function public.guard_package_entitlement_definition();
revoke execute on function public.guard_package_entitlement_definition() from public,anon,authenticated;

-- Keep the existing lifecycle behavior, changing only the package row-lock scope.
-- SKIP LOCKED used to silently complete without consuming a session when a grant
-- (or its joined template) was temporarily locked. Wait for only the eligible grant;
-- metadata edits must not skip session consumption. No historical backfill occurs.
create or replace function public.automate_appointment_lifecycle()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_customer public.customers%rowtype;
  v_service_id uuid;
  v_waitlist_id uuid;
begin
  if tg_op='INSERT' then
    select * into v_customer from public.customers where id=new.customer_id;
    if v_customer.email is not null then
      insert into public.communication_jobs(business_id,user_id,channel,recipient,template_key,payload,available_at)
      values(new.business_id,v_customer.user_id,'email',v_customer.email,'appointment_reminder',
        jsonb_build_object('appointmentId',new.id,'startsAt',new.starts_at),greatest(now(),new.starts_at-interval '24 hours'));
    elsif length(v_customer.phone) >= 10 then
      insert into public.communication_jobs(business_id,user_id,channel,recipient,template_key,payload,available_at)
      values(new.business_id,v_customer.user_id,'sms',v_customer.phone,'appointment_reminder',
        jsonb_build_object('appointmentId',new.id,'startsAt',new.starts_at),greatest(now(),new.starts_at-interval '24 hours'));
    end if;
    return new;
  end if;

  if old.status is distinct from new.status and new.status='completed' then
    insert into public.loyalty_accounts(business_id,customer_id,points)
      values(new.business_id,new.customer_id,10)
      on conflict(business_id,customer_id) do update set points=public.loyalty_accounts.points+10,updated_at=now();
    select ai.service_id into v_service_id from public.appointment_items ai where ai.appointment_id=new.id order by ai.id limit 1;
    update public.customer_packages cp set remaining_sessions=remaining_sessions-1
      where cp.id=(select cp2.id from public.customer_packages cp2 join public.service_packages sp on sp.id=cp2.package_id
        where cp2.customer_id=new.customer_id and cp2.business_id=new.business_id and cp2.remaining_sessions>0
          and cp2.expires_at>now() and (sp.service_id is null or sp.service_id=v_service_id)
        order by cp2.expires_at for update of cp2 limit 1);
  elsif old.status is distinct from new.status and new.status='cancelled' then
    update public.appointment_resource_reservations set released_at=now() where appointment_id=new.id and released_at is null;
    select ai.service_id into v_service_id from public.appointment_items ai where ai.appointment_id=new.id order by ai.id limit 1;
    update public.waitlist_entries set status='expired',offer_expires_at=null,offered_starts_at=null,updated_at=now()
      where business_id=new.business_id and status='offered' and offer_expires_at<now();
    select id into v_waitlist_id from public.waitlist_entries
      where business_id=new.business_id and branch_id=new.branch_id and service_id=v_service_id and status='waiting'
        and new.starts_at between desired_from and desired_to order by priority,created_at for update skip locked limit 1;
    if v_waitlist_id is not null then
      update public.waitlist_entries set status='offered',offered_starts_at=new.starts_at,
        offer_expires_at=now()+interval '15 minutes',updated_at=now() where id=v_waitlist_id;
      insert into public.communication_jobs(business_id,channel,recipient,template_key,payload)
        select w.business_id,case when c.email is not null then 'email'::public.notification_channel else 'sms'::public.notification_channel end,
          coalesce(c.email,c.phone),'waitlist_offer',jsonb_build_object('waitlistId',w.id,'startsAt',new.starts_at,'expiresAt',w.offer_expires_at)
        from public.waitlist_entries w join public.customers c on c.id=w.customer_id where w.id=v_waitlist_id;
    end if;
  end if;
  return new;
end $$;
-- Still trigger-driven SECURITY DEFINER. Do not expose a balance mutator RPC.
revoke execute on function public.automate_appointment_lifecycle() from public,anon,authenticated;

create index if not exists service_packages_business_created_id_idx on public.service_packages(business_id,created_at desc,id);
create index if not exists customer_packages_business_created_id_idx on public.customer_packages(business_id,created_at desc,id);

-- Added last in the same transaction. Native API fails closed until this migration
-- (tenant FKs, RLS and immutable entitlements) has been committed successfully.
create or replace function public.native_package_management_ready(p_business_id uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select public.has_business_role(p_business_id,array['OWNER','MANAGER']::public.business_member_role[]);
$$;
revoke execute on function public.native_package_management_ready(uuid) from public,anon;
grant execute on function public.native_package_management_ready(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
