-- Package snapshots and an append-only session ledger. No historical usage is
-- inferred or backfilled. No price/payment exists in current package templates.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Match lifecycle's appointment -> balance -> template lock order. A bounded
-- lock wait aborts the entire installation; it never repairs live rows.
lock table public.appointments,public.customer_packages,public.service_packages in share row exclusive mode;

do $$ begin
  if to_regprocedure('public.native_package_management_ready(uuid)') is null then
    raise exception 'PACKAGE_LEDGER_PREREQUISITE_027' using errcode='23514';
  end if;
  if exists(select 1 from public.customer_packages cp left join public.service_packages sp on sp.id=cp.package_id
    left join public.customers c on c.id=cp.customer_id where sp.id is null or c.id is null
      or cp.business_id<>sp.business_id or cp.business_id<>c.business_id
      or not isfinite(cp.created_at) or not isfinite(cp.expires_at) or cp.remaining_sessions<0 or cp.remaining_sessions>1000000)
    or exists(select 1 from public.service_packages sp left join public.services s on s.id=sp.service_id
      where length(sp.name) not between 1 and 120 or sp.session_count not between 1 and 1000
        or sp.validity_days not between 1 and 3650 or (sp.service_id is not null and (s.id is null or s.business_id<>sp.business_id))) then
    raise exception 'PACKAGE_LEDGER_INTEGRITY' using errcode='23514';
  end if;
end $$;
create unique index if not exists customer_packages_business_ledger_key on public.customer_packages(business_id,id);
create unique index if not exists appointments_business_package_ledger_key on public.appointments(business_id,id);

create table public.customer_package_snapshots(
  customer_package_id uuid primary key,
  business_id uuid not null,
  origin text not null check(origin in ('grant','legacy_baseline')),
  package_name text not null,
  service_id uuid,
  initial_sessions integer check(initial_sessions between 1 and 1000),
  validity_days integer check(validity_days between 1 and 3650),
  recorded_at timestamptz not null default now(),
  foreign key(business_id,customer_package_id) references public.customer_packages(business_id,id) on delete restrict,
  check((origin='grant' and initial_sessions is not null and validity_days is not null)
    or (origin='legacy_baseline' and initial_sessions is null and validity_days is null))
);
create table public.package_session_ledger(
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  business_id uuid not null,
  customer_package_id uuid not null,
  kind text not null check(kind in ('grant','baseline','consume')),
  sessions_delta integer not null,
  balance_after integer not null check(balance_after>=0),
  appointment_id uuid,
  service_id uuid,
  service_name text,
  occurred_at timestamptz not null default now(),
  foreign key(business_id,customer_package_id) references public.customer_packages(business_id,id) on delete restrict,
  foreign key(business_id,appointment_id) references public.appointments(business_id,id) on delete restrict,
  check((kind='grant' and sessions_delta>0 and appointment_id is null)
    or (kind='baseline' and sessions_delta=0 and appointment_id is null)
    or (kind='consume' and sessions_delta=-1 and appointment_id is not null))
);
create unique index package_session_ledger_appointment_once on public.package_session_ledger(appointment_id) where appointment_id is not null;
create unique index package_session_ledger_start_once on public.package_session_ledger(customer_package_id) where kind in ('grant','baseline');
create index package_session_ledger_page_idx on public.package_session_ledger(business_id,customer_package_id,sequence desc);
create table public.package_completion_receipts(
  appointment_id uuid primary key,
  business_id uuid not null,
  outcome text not null check(outcome in ('consumed','no_eligible','legacy_unknown')),
  customer_package_id uuid,
  observed_at timestamptz not null default now(),
  check((outcome='consumed')=(customer_package_id is not null)),
  foreign key(business_id,appointment_id) references public.appointments(business_id,id) on delete restrict,
  foreign key(business_id,customer_package_id) references public.customer_packages(business_id,id) on delete restrict
);

create or replace function public.guard_package_ledger_immutable()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'PACKAGE_LEDGER_APPEND_ONLY' using errcode='23514'; end;
$$;
create trigger customer_package_snapshot_immutable before update or delete on public.customer_package_snapshots for each row execute function public.guard_package_ledger_immutable();
create trigger package_session_ledger_immutable before update or delete on public.package_session_ledger for each row execute function public.guard_package_ledger_immutable();
create trigger package_completion_receipt_immutable before update or delete on public.package_completion_receipts for each row execute function public.guard_package_ledger_immutable();
revoke all on function public.guard_package_ledger_immutable() from public,anon,authenticated;

create or replace function public.record_new_customer_package()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_template public.service_packages%rowtype;
begin
  select * into v_template from public.service_packages sp where sp.id=new.package_id and sp.business_id=new.business_id for share;
  if not found or not v_template.active or length(v_template.name) not between 1 and 120
    or new.remaining_sessions<>v_template.session_count or not isfinite(new.expires_at)
    or new.expires_at<>now()+v_template.validity_days*interval '24 hours'
    or not exists(select 1 from public.customers c where c.id=new.customer_id and c.business_id=new.business_id) then
    raise exception 'PACKAGE_GRANT_INVALID' using errcode='23514';
  end if;
  insert into public.customer_package_snapshots(customer_package_id,business_id,origin,package_name,service_id,initial_sessions,validity_days)
    values(new.id,new.business_id,'grant',v_template.name,v_template.service_id,v_template.session_count,v_template.validity_days);
  insert into public.package_session_ledger(business_id,customer_package_id,kind,sessions_delta,balance_after)
    values(new.business_id,new.id,'grant',new.remaining_sessions,new.remaining_sessions);
  return new;
end;
$$;
create trigger customer_package_insert_snapshot after insert on public.customer_packages for each row execute function public.record_new_customer_package();
revoke all on function public.record_new_customer_package() from public,anon,authenticated;

create or replace function public.assign_customer_package_atomic(p_business_id uuid,p_customer_id uuid,p_package_id uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_template public.service_packages%rowtype; v_previous public.customer_packages%rowtype; v_created public.customer_packages%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.business_members m where m.business_id=p_business_id and m.user_id=auth.uid() and m.active and m.role in ('OWNER','MANAGER')) then
    raise exception 'PACKAGE_ACCESS_DENIED' using errcode='42501';
  end if;
  if p_id is null or p_customer_id is null or p_package_id is null then raise exception 'PACKAGE_INPUT_INVALID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('package-grant:'||p_id::text,0));
  select * into v_previous from public.customer_packages where id=p_id;
  if found then
    if v_previous.business_id<>p_business_id or v_previous.customer_id<>p_customer_id or v_previous.package_id<>p_package_id then
      raise exception 'PACKAGE_GRANT_KEY_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('id',p_id,'saved',true);
  end if;
  select * into v_template from public.service_packages where id=p_package_id and business_id=p_business_id for share;
  if not found then raise exception 'PACKAGE_NOT_FOUND' using errcode='P0002'; end if;
  if not v_template.active then raise exception 'PACKAGE_INACTIVE' using errcode='23514'; end if;
  if length(v_template.name) not between 1 and 120 then raise exception 'PACKAGE_GRANT_INVALID' using errcode='23514'; end if;
  perform 1 from public.customers c where c.id=p_customer_id and c.business_id=p_business_id for key share;
  if not found then raise exception 'PACKAGE_CUSTOMER_NOT_FOUND' using errcode='P0002'; end if;
  if v_template.service_id is not null then
    perform 1 from public.services s where s.id=v_template.service_id and s.business_id=p_business_id and s.active for share;
    if not found then raise exception 'PACKAGE_SERVICE_INACTIVE' using errcode='23514'; end if;
  end if;
  insert into public.customer_packages(id,business_id,customer_id,package_id,remaining_sessions,expires_at)
    values(p_id,p_business_id,p_customer_id,p_package_id,v_template.session_count,now()+v_template.validity_days*interval '24 hours') returning * into v_created;
  return jsonb_build_object('id',v_created.id,'saved',true);
end;
$$;
revoke all on function public.assign_customer_package_atomic(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.assign_customer_package_atomic(uuid,uuid,uuid,uuid) to authenticated;

create or replace function public.observe_legacy_package_completion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='completed' and new.status is distinct from old.status then
    insert into public.package_completion_receipts(appointment_id,business_id,outcome)
      values(old.id,old.business_id,'legacy_unknown') on conflict(appointment_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger appointment_package_legacy_completion before update of status on public.appointments for each row execute function public.observe_legacy_package_completion();
revoke all on function public.observe_legacy_package_completion() from public,anon,authenticated;

-- Returns whether this is the first tracked completion. The appointment lock
-- and receipt make both entitlement consumption and the completion reward once
-- only, including first completions with no eligible package.
create or replace function public.consume_customer_package_session(p_appointment_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_appointment public.appointments%rowtype; v_grant public.customer_packages%rowtype; v_template public.service_packages%rowtype;
  v_service uuid; v_service_name text; v_previous_setting text;
begin
  select * into v_appointment from public.appointments where id=p_appointment_id for update;
  if not found or v_appointment.status<>'completed' then raise exception 'PACKAGE_COMPLETION_INVALID' using errcode='23514'; end if;
  if exists(select 1 from public.package_completion_receipts where appointment_id=p_appointment_id) then return false; end if;
  if not exists(select 1 from public.customers c where c.id=v_appointment.customer_id and c.business_id=v_appointment.business_id)
    or exists(select 1 from public.appointment_items ai left join public.services s on s.id=ai.service_id
      where ai.appointment_id=p_appointment_id and (ai.business_id<>v_appointment.business_id or s.id is null or s.business_id<>v_appointment.business_id)) then
    raise exception 'PACKAGE_COMPLETION_INTEGRITY' using errcode='23514';
  end if;
  select ai.service_id,s.name into v_service,v_service_name from public.appointment_items ai
    join public.services s on s.id=ai.service_id and s.business_id=v_appointment.business_id
    where ai.appointment_id=p_appointment_id and ai.business_id=v_appointment.business_id order by ai.id limit 1;
  select cp.* into v_grant from public.customer_packages cp join public.service_packages sp on sp.id=cp.package_id and sp.business_id=cp.business_id
    where cp.business_id=v_appointment.business_id and cp.customer_id=v_appointment.customer_id and cp.remaining_sessions>0
      and cp.expires_at>now() and (sp.service_id is null or sp.service_id=v_service)
    order by cp.expires_at,cp.id for update of cp limit 1;
  if found then
    if not exists(select 1 from public.customer_package_snapshots where customer_package_id=v_grant.id) then
      select * into v_template from public.service_packages where id=v_grant.package_id and business_id=v_grant.business_id for share;
      insert into public.customer_package_snapshots(customer_package_id,business_id,origin,package_name,service_id)
        values(v_grant.id,v_grant.business_id,'legacy_baseline',v_template.name,v_template.service_id);
      insert into public.package_session_ledger(business_id,customer_package_id,kind,sessions_delta,balance_after)
        values(v_grant.business_id,v_grant.id,'baseline',0,v_grant.remaining_sessions);
    end if;
    v_previous_setting:=current_setting('salonny.package_consumption_appointment',true);
    perform set_config('salonny.package_consumption_appointment',p_appointment_id::text,true);
    update public.customer_packages set remaining_sessions=remaining_sessions-1 where id=v_grant.id;
    perform set_config('salonny.package_consumption_appointment',coalesce(v_previous_setting,''),true);
    insert into public.package_session_ledger(business_id,customer_package_id,kind,sessions_delta,balance_after,appointment_id,service_id,service_name)
      values(v_grant.business_id,v_grant.id,'consume',-1,v_grant.remaining_sessions-1,p_appointment_id,v_service,v_service_name);
    insert into public.package_completion_receipts(appointment_id,business_id,outcome,customer_package_id)
      values(v_appointment.id,v_appointment.business_id,'consumed',v_grant.id);
  else
    insert into public.package_completion_receipts(appointment_id,business_id,outcome)
      values(v_appointment.id,v_appointment.business_id,'no_eligible');
  end if;
  return true;
end;
$$;
revoke all on function public.consume_customer_package_session(uuid) from public,anon,authenticated;

create or replace function public.guard_customer_package_balance()
returns trigger language plpgsql set search_path='' as $$
declare v_appointment uuid;
begin
  if tg_op='DELETE' then raise exception 'PACKAGE_LEDGER_APPEND_ONLY' using errcode='23514'; end if;
  v_appointment:=nullif(current_setting('salonny.package_consumption_appointment',true),'')::uuid;
  if new.id is distinct from old.id or new.business_id is distinct from old.business_id
    or new.customer_id is distinct from old.customer_id or new.package_id is distinct from old.package_id
    or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at
    or new.remaining_sessions<>old.remaining_sessions-1 or v_appointment is null then
    raise exception 'PACKAGE_BALANCE_WRITE_FORBIDDEN' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger customer_package_balance_guard before update or delete on public.customer_packages for each row execute function public.guard_customer_package_balance();
revoke all on function public.guard_customer_package_balance() from public,anon,authenticated;

-- Seal raw balance/ledger writes including PostgREST defaults and column ACLs.
alter table public.customer_package_snapshots enable row level security;
alter table public.package_session_ledger enable row level security;
alter table public.package_completion_receipts enable row level security;
drop policy if exists customer_packages_manager_insert on public.customer_packages;
drop policy if exists customer_packages_manager_update on public.customer_packages;
drop policy if exists customer_packages_manager_delete on public.customer_packages;
revoke all on public.customer_packages,public.customer_package_snapshots,public.package_session_ledger,public.package_completion_receipts from public,anon,authenticated;
do $$ declare v_table text; v_column text; begin
  foreach v_table in array array['customer_packages','customer_package_snapshots','package_session_ledger','package_completion_receipts'] loop
    for v_column in select attname from pg_attribute where attrelid=('public.'||v_table)::regclass and attnum>0 and not attisdropped loop
      execute format('revoke select(%I),insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',v_column,v_column,v_column,v_column,v_table);
    end loop;
  end loop;
end $$;
grant select on public.customer_packages to authenticated;

create or replace function public.native_package_ledger_ready(p_business_id uuid)
returns boolean language sql stable set search_path='' as $$
  select public.has_business_role(p_business_id,array['OWNER','MANAGER']::public.business_member_role[]);
$$;
revoke all on function public.native_package_ledger_ready(uuid) from public,anon;
grant execute on function public.native_package_ledger_ready(uuid) to authenticated;

create or replace function public.native_customer_package_ledger(p_business_id uuid,p_customer_package_id uuid,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_grant public.customer_packages%rowtype; v_snapshot public.customer_package_snapshots%rowtype;
  v_template public.service_packages%rowtype; v_count bigint; v_consumed bigint; v_balance integer;
  v_start_balance integer; v_start_count bigint;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.business_members m where m.business_id=p_business_id and m.user_id=auth.uid() and m.active and m.role in ('OWNER','MANAGER')) then
    raise exception 'PACKAGE_ACCESS_DENIED' using errcode='42501';
  end if;
  if p_offset is null or p_offset<0 or p_offset>100000 or p_offset%25<>0 then raise exception 'PACKAGE_INPUT_INVALID' using errcode='22023'; end if;
  select * into v_grant from public.customer_packages where id=p_customer_package_id and business_id=p_business_id;
  if not found then raise exception 'PACKAGE_GRANT_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_snapshot from public.customer_package_snapshots where customer_package_id=v_grant.id and business_id=p_business_id;
  select * into v_template from public.service_packages where id=v_grant.package_id and business_id=p_business_id;
  select count(*),count(*) filter(where kind='consume') into v_count,v_consumed
    from public.package_session_ledger where customer_package_id=v_grant.id and business_id=p_business_id;
  select balance_after into v_balance from public.package_session_ledger where customer_package_id=v_grant.id and business_id=p_business_id order by sequence desc limit 1;
  select count(*),max(balance_after) into v_start_count,v_start_balance from public.package_session_ledger
    where customer_package_id=v_grant.id and business_id=p_business_id and kind in ('grant','baseline');
  if (v_balance is not null and v_balance<>v_grant.remaining_sessions)
    or (v_snapshot.customer_package_id is null and v_count<>0)
    or (v_snapshot.customer_package_id is not null and (v_start_count<>1 or v_start_balance-v_grant.remaining_sessions<>v_consumed))
    or (v_snapshot.origin='grant' and (v_snapshot.initial_sessions-v_grant.remaining_sessions<>v_consumed or v_start_balance<>v_snapshot.initial_sessions))
    or exists(select 1 from public.package_session_ledger l left join public.package_completion_receipts r on r.appointment_id=l.appointment_id
      where l.customer_package_id=v_grant.id and (l.business_id<>p_business_id or not isfinite(l.occurred_at)
        or (l.kind='consume' and (r.appointment_id is null or r.outcome<>'consumed' or r.customer_package_id<>v_grant.id or r.business_id<>p_business_id)))) then
    raise exception 'PACKAGE_LEDGER_INTEGRITY' using errcode='23514';
  end if;
  return jsonb_build_object('grant',jsonb_build_object(
    'id',v_grant.id,'customerId',v_grant.customer_id,'packageId',v_grant.package_id,
    'packageName',coalesce(v_snapshot.package_name,v_template.name),'remainingSessions',v_grant.remaining_sessions,
    'expiresAt',v_grant.expires_at,'initialSessions',v_snapshot.initial_sessions,'validityDays',v_snapshot.validity_days,
    'origin',coalesce(v_snapshot.origin,'unrecorded'),'recordedAt',v_snapshot.recorded_at,
    'serviceId',case when v_snapshot.customer_package_id is not null then v_snapshot.service_id else v_template.service_id end,'priceMinor',null,'currency',null,
    'usedSessions',case when v_snapshot.origin='grant' then v_consumed else null end,'recordedUsedSessions',v_consumed),
    'offset',p_offset,'total',v_count,'hasMore',p_offset+25<v_count,
    'rows',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'sessionsDelta',l.sessions_delta,
      'balanceAfter',l.balance_after,'appointmentId',l.appointment_id,'serviceName',l.service_name,'occurredAt',l.occurred_at) order by l.sequence desc)
      from(select * from public.package_session_ledger where customer_package_id=v_grant.id and business_id=p_business_id order by sequence desc offset p_offset limit 25) l),'[]'::jsonb));
end;
$$;
revoke all on function public.native_customer_package_ledger(uuid,uuid,integer) from public,anon;
grant execute on function public.native_customer_package_ledger(uuid,uuid,integer) to authenticated;

-- Preserve reminder/resource/waitlist behavior. The only completed-block change
-- delegates package consumption and gates the existing +10 loyalty reward on
-- the same fresh receipt. Historical credits are neither inferred nor repaired.
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
    if public.consume_customer_package_session(new.id) then
      insert into public.loyalty_accounts(business_id,customer_id,points)
        values(new.business_id,new.customer_id,10)
        on conflict(business_id,customer_id) do update set points=public.loyalty_accounts.points+10,updated_at=now();
    end if;
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
revoke execute on function public.automate_appointment_lifecycle() from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
