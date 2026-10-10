-- Native resource management. Atomic, no destructive repair or reservation backfill.
begin;
do $$ begin
  if exists(select 1 from public.business_resources r left join public.branches b on b.id=r.branch_id and b.business_id=r.business_id where b.id is null)
    or exists(select 1 from public.service_resources sr join public.business_resources r on r.id=sr.resource_id left join public.services s on s.id=sr.service_id and s.business_id=r.business_id where s.id is null or sr.quantity>r.capacity or not exists(select 1 from public.branch_services bs where bs.service_id=sr.service_id and bs.branch_id=r.branch_id))
    or exists(select 1 from public.appointment_resource_reservations ar join public.business_resources r on r.id=ar.resource_id join public.appointments a on a.id=ar.appointment_id where ar.business_id<>r.business_id or ar.business_id<>a.business_id or r.branch_id<>a.branch_id)
  then raise exception 'resource_tenant_integrity_violation: administrator review required; no changes made' using errcode='23514'; end if;
end $$;

-- Earlier reschedules could leave a hold at the old appointment time. Never
-- claim correct capacity on those records or silently rewrite their history.
do $$ begin
  if exists(select 1 from public.appointment_resource_reservations ar join public.appointments a on a.id=ar.appointment_id where ar.released_at is null and (ar.starts_at<>a.starts_at or ar.ends_at<>a.ends_at))
  then raise exception 'resource_hold_window_integrity_violation: administrator review required; no changes made' using errcode='23514'; end if;
end $$;

create unique index if not exists branches_business_resource_key on public.branches(business_id,id);
create unique index if not exists services_business_id_id_package_key on public.services(business_id,id);
create unique index if not exists resources_business_branch_id_key on public.business_resources(business_id,branch_id,id);
create unique index if not exists resources_business_id_key on public.business_resources(business_id,id);
create unique index if not exists appointments_business_branch_resource_key on public.appointments(business_id,branch_id,id);
alter table public.service_resources add column if not exists business_id uuid;
update public.service_resources sr set business_id=r.business_id from public.business_resources r where r.id=sr.resource_id and sr.business_id is null;
alter table public.service_resources alter column business_id set not null;
alter table public.appointment_resource_reservations add column if not exists branch_id uuid;
update public.appointment_resource_reservations ar set branch_id=r.branch_id from public.business_resources r where r.id=ar.resource_id and ar.branch_id is null;
alter table public.appointment_resource_reservations alter column branch_id set not null;
alter table public.business_resources add constraint resources_tenant_branch_fk foreign key(business_id,branch_id) references public.branches(business_id,id) on delete cascade not valid;
alter table public.service_resources add constraint resource_links_tenant_service_fk foreign key(business_id,service_id) references public.services(business_id,id) on delete cascade not valid;
alter table public.service_resources add constraint resource_links_tenant_resource_fk foreign key(business_id,resource_id) references public.business_resources(business_id,id) on delete cascade not valid;
alter table public.appointment_resource_reservations add constraint resource_reservations_tenant_resource_fk foreign key(business_id,branch_id,resource_id) references public.business_resources(business_id,branch_id,id) on delete restrict not valid;
alter table public.appointment_resource_reservations add constraint resource_reservations_tenant_appointment_fk foreign key(business_id,branch_id,appointment_id) references public.appointments(business_id,branch_id,id) on delete cascade not valid;
alter table public.business_resources validate constraint resources_tenant_branch_fk;
alter table public.service_resources validate constraint resource_links_tenant_service_fk;
alter table public.service_resources validate constraint resource_links_tenant_resource_fk;
alter table public.appointment_resource_reservations validate constraint resource_reservations_tenant_resource_fk;
alter table public.appointment_resource_reservations validate constraint resource_reservations_tenant_appointment_fk;
-- Preserve one unambiguous PostgREST relationship for existing unhinted embeds.
alter table public.business_resources drop constraint if exists business_resources_branch_id_fkey;
alter table public.service_resources drop constraint if exists service_resources_service_id_fkey;
alter table public.service_resources drop constraint if exists service_resources_resource_id_fkey;
alter table public.appointment_resource_reservations drop constraint if exists appointment_resource_reservations_resource_id_fkey;
alter table public.appointment_resource_reservations drop constraint if exists appointment_resource_reservations_appointment_id_fkey;

-- A reservation row is ONE occupied unit. Group same-time deltas before summing
-- so an end and next start at the same timestamp never create a false overlap.
create or replace function public.resource_peak_units(p_resource_id uuid,p_from timestamptz,p_to timestamptz)
returns integer language sql stable security invoker set search_path=public,pg_temp as $$
  with spans as (
    select greatest(starts_at,p_from) starts_at,least(ends_at,p_to) ends_at
    from public.appointment_resource_reservations
    where resource_id=p_resource_id and released_at is null and starts_at<p_to and ends_at>p_from
  ), events as (
    select starts_at instant,1 delta from spans union all select ends_at,-1 from spans
  ), levels as (
    select sum(sum(delta)) over(order by instant) units from events group by instant
  ) select coalesce(max(units),0)::integer from levels;
$$;
revoke execute on function public.resource_peak_units(uuid,timestamptz,timestamptz) from public,anon,authenticated;

-- Reject pre-existing live overcapacity rather than deleting or rewriting holds.
do $$ begin
  if exists(select 1 from public.business_resources r where public.resource_peak_units(r.id,now(),'infinity'::timestamptz)>r.capacity)
  then raise exception 'resource_capacity_integrity_violation: administrator review required' using errcode='23514'; end if;
end $$;

create or replace function public.guard_resource_definition()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'resource_delete_forbidden' using errcode='23514'; end if;
  if new.id<>old.id or new.business_id<>old.business_id or new.branch_id<>old.branch_id then
    raise exception 'resource_scope_immutable' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(old.id::text,0));
  if (new.capacity<old.capacity or (old.active and not new.active)) and exists(
    select 1 from public.appointment_resource_reservations where resource_id=old.id and released_at is null and ends_at>clock_timestamp()
  ) then raise exception 'resource_has_upcoming_reservations' using errcode='23P01'; end if;
  if exists(select 1 from public.service_resources where resource_id=old.id and quantity>new.capacity)
  then raise exception 'resource_capacity_below_requirement' using errcode='23514'; end if;
  return new;
end $$;
create trigger resource_definition_guard before update or delete on public.business_resources for each row execute function public.guard_resource_definition();
revoke execute on function public.guard_resource_definition() from public,anon,authenticated;
revoke delete on public.business_resources from public,anon,authenticated;

-- Single-edge updates do not remove other service requirements. Serialize with
-- booking BEFORE enumerating links, then use the shared per-resource lock.
create or replace function public.guard_service_resource_link()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_resource public.business_resources%rowtype; v_resource_id uuid; v_service_id uuid;
begin
  v_resource_id:=case when tg_op='DELETE' then old.resource_id else new.resource_id end;
  v_service_id:=case when tg_op='DELETE' then old.service_id else new.service_id end;
  if tg_op='UPDATE' and (new.resource_id<>old.resource_id or new.service_id<>old.service_id or new.business_id<>old.business_id)
  then raise exception 'resource_link_scope_immutable' using errcode='23514'; end if;
  select * into v_resource from public.business_resources where id=v_resource_id;
  if not found then raise exception 'invalid_resource' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended('resource-service:'||v_service_id::text||':'||v_resource.branch_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_resource_id::text,0));
  if tg_op='DELETE' then return old; end if;
  -- Re-read capacity AFTER the shared lock, never trust the earlier scope lookup.
  select * into v_resource from public.business_resources where id=v_resource_id;
  if new.business_id is not null and new.business_id<>v_resource.business_id then raise exception 'resource_link_tenant_mismatch' using errcode='23514'; end if;
  new.business_id:=v_resource.business_id;
  if not exists(select 1 from public.services s join public.branch_services bs on bs.service_id=s.id and bs.branch_id=v_resource.branch_id where s.id=v_service_id and s.business_id=v_resource.business_id and s.active and bs.active)
    or not v_resource.active or new.quantity>v_resource.capacity
  then raise exception 'invalid_resource_requirement' using errcode='23514'; end if;
  return new;
end $$;
create trigger service_resource_link_guard before insert or update or delete on public.service_resources for each row execute function public.guard_service_resource_link();
revoke execute on function public.guard_service_resource_link() from public,anon,authenticated;

create or replace function public.reserve_resources_for_appointment_item()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_appointment public.appointments%rowtype; v_requirement record; v_resource public.business_resources%rowtype; v_quantity integer; v_used integer; i integer;
begin
  select * into v_appointment from public.appointments where id=new.appointment_id;
  if not found or v_appointment.business_id<>new.business_id or not exists(select 1 from public.services where id=new.service_id and business_id=v_appointment.business_id)
  then raise exception 'resource_appointment_scope_mismatch' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended('resource-service:'||new.service_id::text||':'||v_appointment.branch_id::text,0));
  for v_requirement in select sr.resource_id from public.service_resources sr join public.business_resources r on r.id=sr.resource_id
    where sr.service_id=new.service_id and r.branch_id=v_appointment.branch_id order by sr.resource_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_requirement.resource_id::text,0));
    select * into v_resource from public.business_resources where id=v_requirement.resource_id;
    select quantity into v_quantity from public.service_resources where service_id=new.service_id and resource_id=v_requirement.resource_id;
    if not found then continue; end if;
    if v_resource.business_id<>v_appointment.business_id or v_resource.branch_id<>v_appointment.branch_id or not v_resource.active then raise exception 'resource_conflict' using errcode='23P01'; end if;
    v_used:=public.resource_peak_units(v_resource.id,v_appointment.starts_at,v_appointment.ends_at);
    if v_used+v_quantity>v_resource.capacity then raise exception 'resource_conflict' using errcode='23P01'; end if;
    for i in 1..v_quantity loop
      insert into public.appointment_resource_reservations(appointment_id,business_id,branch_id,resource_id,starts_at,ends_at)
      values(v_appointment.id,v_appointment.business_id,v_appointment.branch_id,v_resource.id,v_appointment.starts_at,v_appointment.ends_at);
    end loop;
  end loop;
  return new;
end $$;
revoke execute on function public.reserve_resources_for_appointment_item() from public,anon,authenticated;

-- The existing reschedule RPC validates staff slots but did not move resource
-- holds. Enforce this for EVERY appointment time-update entry point atomically.
-- Existing holds are moved only when their unit graph exactly matches current
-- service requirements. Changes to that graph require manager review, never
-- an invisible backfill, extra reservation, or deletion of historical units.
create or replace function public.retime_appointment_resource_reservations()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_scope record; v_resource_id uuid; v_resource public.business_resources%rowtype;
begin
  if new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at and new.branch_id is not distinct from old.branch_id and new.business_id is not distinct from old.business_id then return new; end if;
  if (new.business_id is distinct from old.business_id or new.branch_id is distinct from old.branch_id) and exists(
    select 1 from public.appointment_resource_reservations where appointment_id=old.id and released_at is null
  ) then raise exception 'resource_scope_immutable' using errcode='23514'; end if;

  -- Branch changes without holds lock both old/new service scopes in one stable
  -- order. With holds the appointment scope is immutable, checked above.
  for v_scope in
    select distinct ai.service_id,b.branch_id from public.appointment_items ai
    cross join (values(old.branch_id),(new.branch_id)) b(branch_id)
    where ai.appointment_id=old.id order by ai.service_id,b.branch_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('resource-service:'||v_scope.service_id::text||':'||v_scope.branch_id::text,0));
  end loop;
  for v_resource_id in
    select ids.resource_id from (
      select ar.resource_id from public.appointment_resource_reservations ar where ar.appointment_id=old.id and ar.released_at is null
      union
      select sr.resource_id from public.appointment_items ai join public.service_resources sr on sr.service_id=ai.service_id
      join public.business_resources r on r.id=sr.resource_id
      where ai.appointment_id=old.id and ai.business_id=new.business_id and r.business_id=new.business_id and r.branch_id=new.branch_id
    ) ids order by ids.resource_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_resource_id::text,0));
  end loop;
  -- Compute quantities AFTER acquiring every resource lock. Count each item:
  -- a repeated service item consumes its requirement again, like INSERT does.
  if exists(
    with required as (
      select sr.resource_id,sum(sr.quantity) quantity from public.appointment_items ai
      join public.service_resources sr on sr.service_id=ai.service_id
      join public.business_resources r on r.id=sr.resource_id
      where ai.appointment_id=old.id and ai.business_id=new.business_id and r.business_id=new.business_id and r.branch_id=new.branch_id
      group by sr.resource_id
    ), held as (
      select resource_id,count(*) quantity from public.appointment_resource_reservations
      where appointment_id=old.id and released_at is null group by resource_id
    ) select 1 from required r full join held h using(resource_id) where coalesce(r.quantity,0)<>coalesce(h.quantity,0)
  -- 006's reschedule RPC catches exclusion_violation (23P01) and replaces its
  -- message with appointment_conflict. Use serialization_failure for this
  -- retime-only guard so the API can retain actionable manager-review guidance.
  ) then raise exception 'resource_graph_changed' using errcode='40001'; end if;

  update public.appointment_resource_reservations set starts_at=new.starts_at,ends_at=new.ends_at where appointment_id=old.id and released_at is null;
  for v_resource_id in
    select distinct resource_id from public.appointment_resource_reservations where appointment_id=old.id and released_at is null order by resource_id
  loop
    -- Plain SELECT avoids parent UPDATE-row-lock -> advisory-lock deadlocks.
    -- Any failure rolls back both the appointment move and ALL retimed units.
    select * into v_resource from public.business_resources where id=v_resource_id;
    if not found or v_resource.business_id<>new.business_id or v_resource.branch_id<>new.branch_id or not v_resource.active or public.resource_peak_units(v_resource_id,new.starts_at,new.ends_at)>v_resource.capacity
    then raise exception 'resource_conflict' using errcode='40001'; end if;
  end loop;
  return new;
end $$;
create trigger appointment_resource_retime_guard before update of starts_at,ends_at,branch_id,business_id on public.appointments for each row execute function public.retime_appointment_resource_reservations();
revoke execute on function public.retime_appointment_resource_reservations() from public,anon,authenticated;

-- No client can forge/release/retime capacity units, including an employee using
-- raw PostgREST. Existing SECURITY DEFINER reserve/cancellation automation still works.
drop policy if exists resource_reservations_tenant on public.appointment_resource_reservations;
create policy resource_reservations_manager_read on public.appointment_resource_reservations for select to authenticated using(public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
revoke insert,update,delete on public.appointment_resource_reservations from public,anon,authenticated;
-- Resource/link mutations go through one scoped atomic RPC. No client can bypass
-- lock ordering or tenant/active checks with direct REST writes.
revoke insert,update,delete on public.business_resources,public.service_resources from public,anon,authenticated;
create index if not exists resource_reservations_scope_window_idx on public.appointment_resource_reservations(business_id,branch_id,resource_id,starts_at,id) where released_at is null;

create or replace function public.manage_business_resource(p_business_id uuid,p_branch_id uuid,p_action text,p_resource_id uuid,p_values jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid:=coalesce(p_resource_id,gen_random_uuid()); v_existing public.business_resources%rowtype; v_service_id uuid; v_services uuid[]; v_name text; v_capacity integer; v_active boolean; v_quantity integer; v_assigned boolean;
begin
  if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and active and role in('OWNER','MANAGER')) then raise exception 'business_manager_required' using errcode='42501'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id and active) then raise exception 'invalid_branch' using errcode='22023'; end if;
  if p_action not in('create','update','link') or p_action is null or p_values is null or jsonb_typeof(p_values)<>'object' or octet_length(p_values::text)>8192 then raise exception 'invalid_resource_input' using errcode='22023'; end if;
  if p_action in('create','update') then
    v_name:=btrim(p_values->>'name'); v_capacity:=(p_values->>'capacity')::integer; v_active:=(p_values->>'active')::boolean;
    if v_name is null or length(v_name) not between 2 and 120 or v_capacity is null or v_capacity not between 1 and 100 or v_active is null then raise exception 'invalid_resource_input' using errcode='22023'; end if;
  end if;
  if p_action='create' then
    if exists(select 1 from jsonb_object_keys(p_values) k where k not in('name','kind','capacity','active','serviceIds')) or p_values->>'kind' not in('room','chair','device','other') or p_values->>'kind' is null or jsonb_typeof(coalesce(p_values->'serviceIds','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_values->'serviceIds','[]'::jsonb))>100 then raise exception 'invalid_resource_input' using errcode='22023'; end if;
    select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[]) into v_services from jsonb_array_elements_text(coalesce(p_values->'serviceIds','[]'::jsonb));
    -- Lock ALL requested service scopes in sorted order before any resource lock.
    foreach v_service_id in array v_services loop
      perform pg_advisory_xact_lock(hashtextextended('resource-service:'||v_service_id::text||':'||p_branch_id::text,0));
      if not exists(select 1 from public.services s join public.branch_services bs on bs.service_id=s.id where s.id=v_service_id and s.business_id=p_business_id and s.active and bs.branch_id=p_branch_id and bs.active) then raise exception 'invalid_resource_requirement' using errcode='22023'; end if;
    end loop;
    perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
    select * into v_existing from public.business_resources where id=v_id;
    if found then
      if v_existing.business_id<>p_business_id or v_existing.branch_id<>p_branch_id or v_existing.name<>v_name or v_existing.kind<>p_values->>'kind' or v_existing.capacity<>v_capacity or v_existing.active<>v_active or coalesce((select array_agg(service_id order by service_id) from public.service_resources where resource_id=v_id),'{}'::uuid[])<>v_services or exists(select 1 from public.service_resources where resource_id=v_id and quantity<>1) then raise exception 'resource_request_conflict' using errcode='23505'; end if;
      return v_id;
    end if;
    insert into public.business_resources(id,business_id,branch_id,name,kind,capacity,active) values(v_id,p_business_id,p_branch_id,v_name,p_values->>'kind',v_capacity,v_active);
    foreach v_service_id in array v_services loop insert into public.service_resources(service_id,resource_id,business_id,quantity) values(v_service_id,v_id,p_business_id,1); end loop;
  else
    if p_resource_id is null then raise exception 'invalid_resource_input' using errcode='22023'; end if;
    if p_action='link' then
      if exists(select 1 from jsonb_object_keys(p_values) k where k not in('serviceId','assigned','quantity')) then raise exception 'invalid_resource_input' using errcode='22023'; end if;
      v_service_id:=(p_values->>'serviceId')::uuid; v_quantity:=(p_values->>'quantity')::integer; v_assigned:=(p_values->>'assigned')::boolean;
      if v_service_id is null or v_quantity is null or v_quantity not between 1 and 100 or v_assigned is null then raise exception 'invalid_resource_input' using errcode='22023'; end if;
      perform pg_advisory_xact_lock(hashtextextended('resource-service:'||v_service_id::text||':'||p_branch_id::text,0));
      -- Unlinking may involve an inactive service, but never another tenant or
      -- branch. The insert/update trigger separately requires active targets.
      if not exists(select 1 from public.services s join public.branch_services bs on bs.service_id=s.id where s.id=v_service_id and s.business_id=p_business_id and bs.branch_id=p_branch_id) then raise exception 'invalid_resource_requirement' using errcode='22023'; end if;
    elsif exists(select 1 from jsonb_object_keys(p_values) k where k not in('name','capacity','active')) then raise exception 'invalid_resource_input' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
    select * into v_existing from public.business_resources where id=v_id and business_id=p_business_id and branch_id=p_branch_id;
    if not found then raise exception 'invalid_resource' using errcode='22023'; end if;
    if p_action='update' then update public.business_resources set name=v_name,capacity=v_capacity,active=v_active where id=v_id;
    elsif v_assigned then
      insert into public.service_resources(service_id,resource_id,business_id,quantity) values(v_service_id,v_id,p_business_id,v_quantity) on conflict(service_id,resource_id) do update set quantity=excluded.quantity;
    else delete from public.service_resources where service_id=v_service_id and resource_id=v_id and business_id=p_business_id;
    end if;
  end if;
  return v_id;
end $$;
revoke execute on function public.manage_business_resource(uuid,uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.manage_business_resource(uuid,uuid,text,uuid,jsonb) to authenticated;

create or replace function public.native_resource_management_ready(p_business_id uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and active and role in('OWNER','MANAGER'));
$$;
revoke execute on function public.native_resource_management_ready(uuid) from public,anon;
grant execute on function public.native_resource_management_ready(uuid) to authenticated;

create or replace function public.get_resource_usage_summary(p_business_id uuid,p_branch_id uuid,p_resource_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and active and role in('OWNER','MANAGER')) then raise exception 'business_manager_required' using errcode='42501'; end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<=p_from or p_to-p_from>interval '31 days' or p_from<now()-interval '366 days' or p_to>now()+interval '366 days' then raise exception 'invalid_usage_window' using errcode='22023'; end if;
  if not exists(select 1 from public.business_resources where id=p_resource_id and business_id=p_business_id and branch_id=p_branch_id) then raise exception 'invalid_resource' using errcode='22023'; end if;
  return (select jsonb_build_object('peakUnits',public.resource_peak_units(p_resource_id,p_from,p_to),'reservationCount',count(*),'appointmentCount',count(distinct appointment_id)) from public.appointment_resource_reservations where resource_id=p_resource_id and business_id=p_business_id and branch_id=p_branch_id and released_at is null and starts_at<p_to and ends_at>p_from);
end $$;
revoke execute on function public.get_resource_usage_summary(uuid,uuid,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_resource_usage_summary(uuid,uuid,uuid,timestamptz,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
