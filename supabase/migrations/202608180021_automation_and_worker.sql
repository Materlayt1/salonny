-- Durable communication worker, capacity-aware resources and operational automations.

alter table public.communication_jobs
  add column if not exists worker_id uuid;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-care-assets','customer-care-assets',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists customer_care_assets_member_read on storage.objects;
drop policy if exists customer_care_assets_member_insert on storage.objects;
drop policy if exists customer_care_assets_member_delete on storage.objects;
create policy customer_care_assets_member_read on storage.objects for select to authenticated
  using(bucket_id='customer-care-assets' and public.is_business_member(((storage.foldername(name))[1])::uuid));
create policy customer_care_assets_member_insert on storage.objects for insert to authenticated
  with check(bucket_id='customer-care-assets' and public.is_business_member(((storage.foldername(name))[1])::uuid));
create policy customer_care_assets_member_delete on storage.objects for delete to authenticated
  using(bucket_id='customer-care-assets' and public.is_business_member(((storage.foldername(name))[1])::uuid));

create or replace function public.claim_communication_jobs(p_limit integer default 25, p_worker_id uuid default gen_random_uuid())
returns setof public.communication_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with candidates as (
    select id from public.communication_jobs
    where status in ('queued','retry') and available_at <= now()
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.communication_jobs j
  set status='processing', attempts=j.attempts+1, locked_at=now(), worker_id=p_worker_id
  from candidates c where j.id=c.id
  returning j.*;
end $$;

create or replace function public.complete_communication_job(p_job_id uuid, p_provider text, p_reference text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.communication_jobs
  set status='delivered', provider=p_provider, provider_reference=p_reference,
      delivered_at=now(), locked_at=null, worker_id=null, last_error=null
  where id=p_job_id and status='processing';
$$;

create or replace function public.fail_communication_job(p_job_id uuid, p_error text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.communication_jobs
  set status=case when attempts >= max_attempts then 'dead_letter' else 'retry' end,
      available_at=case when attempts >= max_attempts then available_at
        else now() + make_interval(secs => least(3600, 30 * (2 ^ greatest(0, attempts-1))::integer)) end,
      last_error=left(p_error,1000), locked_at=null, worker_id=null
  where id=p_job_id and status='processing';
$$;

revoke all on function public.claim_communication_jobs(integer,uuid) from public, anon, authenticated;
revoke all on function public.complete_communication_job(uuid,text,text) from public, anon, authenticated;
revoke all on function public.fail_communication_job(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_communication_jobs(integer,uuid) to service_role;
grant execute on function public.complete_communication_job(uuid,text,text) to service_role;
grant execute on function public.fail_communication_job(uuid,text) to service_role;

do $$ begin
  alter table public.appointment_resource_reservations drop constraint if exists appointment_resource_no_overlap;
exception when undefined_table then null;
end $$;

create index if not exists appointment_resource_active_window_idx
  on public.appointment_resource_reservations(resource_id, starts_at, ends_at)
  where released_at is null;

create or replace function public.reserve_resources_for_appointment_item()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_appointment public.appointments%rowtype;
  v_requirement record;
  v_capacity integer;
  v_used integer;
  i integer;
begin
  select * into v_appointment from public.appointments where id=new.appointment_id;
  for v_requirement in
    select sr.resource_id, sr.quantity, r.capacity
    from public.service_resources sr
    join public.business_resources r on r.id=sr.resource_id
    where sr.service_id=new.service_id and r.active and r.branch_id=v_appointment.branch_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_requirement.resource_id::text, 0));
    select count(*) into v_used from public.appointment_resource_reservations arr
      where arr.resource_id=v_requirement.resource_id and arr.released_at is null
        and tstzrange(arr.starts_at,arr.ends_at,'[)') && tstzrange(v_appointment.starts_at,v_appointment.ends_at,'[)');
    v_capacity := v_requirement.capacity;
    if v_used + v_requirement.quantity > v_capacity then raise exception 'resource_conflict' using errcode='23P01'; end if;
    for i in 1..v_requirement.quantity loop
      insert into public.appointment_resource_reservations(appointment_id,business_id,resource_id,starts_at,ends_at)
      values(v_appointment.id,v_appointment.business_id,v_requirement.resource_id,v_appointment.starts_at,v_appointment.ends_at);
    end loop;
  end loop;
  return new;
end $$;

drop trigger if exists appointment_item_reserve_resources on public.appointment_items;
create trigger appointment_item_reserve_resources after insert on public.appointment_items
for each row execute function public.reserve_resources_for_appointment_item();
revoke execute on function public.reserve_resources_for_appointment_item() from public, anon, authenticated;

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
        order by cp2.expires_at for update skip locked limit 1);
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

drop trigger if exists appointment_lifecycle_automation on public.appointments;
create trigger appointment_lifecycle_automation after insert or update of status on public.appointments
for each row execute function public.automate_appointment_lifecycle();
revoke execute on function public.automate_appointment_lifecycle() from public, anon, authenticated;
