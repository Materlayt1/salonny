-- A deletion REQUEST is not account erasure. Withdraw only owned listings,
-- preserve customers/appointments, and forbid republishing while it is active.
begin;

create index if not exists businesses_owner_lifecycle_idx on public.businesses(owner_user_id);

create or replace function public.business_owner_lifecycle_blocked(p_owner_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.users u where u.id=p_owner_id and u.deleted_at is null)
    or exists (select 1 from public.account_deletion_requests r where r.user_id=p_owner_id
      and r.status in ('requested','processing','completed'));
$$;
revoke all on function public.business_owner_lifecycle_blocked(uuid) from public,anon,authenticated;

create or replace function public.lock_business_owner_lifecycle(p_owner_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- A nonblocking transaction lock avoids business-row/owner-row lock inversion
  -- with existing admin RPCs. A conflict aborts; it never partially withdraws.
  if not pg_try_advisory_xact_lock(hashtextextended('business-owner-lifecycle:'||p_owner_id::text,0)) then
    raise exception 'owner_lifecycle_conflict' using errcode='40001';
  end if;
end;
$$;
revoke all on function public.lock_business_owner_lifecycle(uuid) from public,anon,authenticated;

create or replace function public.guard_business_owner_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_business_owner_lifecycle(new.owner_user_id);
  if (new.status in ('published','pending_review') or new.verified_at is not null)
    and public.business_owner_lifecycle_blocked(new.owner_user_id) then
    raise exception 'business_owner_unavailable' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_business_owner_lifecycle() from public,anon,authenticated;
drop trigger if exists businesses_owner_lifecycle on public.businesses;
create trigger businesses_owner_lifecycle before insert or update on public.businesses
  for each row execute function public.guard_business_owner_lifecycle();

create or replace function public.withdraw_owner_businesses(p_owner_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_business record;
begin
  perform public.lock_business_owner_lifecycle(p_owner_id);
  for v_business in select id,status,verified_at from public.businesses
    where owner_user_id=p_owner_id and (status in ('published','pending_review') or verified_at is not null)
    order by id for update
  loop
    update public.businesses set status=case when status in ('published','pending_review') then 'suspended' else status end,
      verified_at=null where id=v_business.id;
    insert into public.audit_logs(business_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
      values(v_business.id,auth.uid(),'business_withdrawn_owner_deletion','business',v_business.id::text,
        jsonb_build_object('status',v_business.status,'verified_at',v_business.verified_at),
        jsonb_build_object('status',case when v_business.status in ('published','pending_review') then 'suspended' else v_business.status end,
          'verified_at',null,'reason','owner_account_deletion'));
  end loop;
end;
$$;
revoke all on function public.withdraw_owner_businesses(uuid) from public,anon,authenticated;

create or replace function public.guard_account_deletion_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_business_owner_lifecycle(new.user_id);
  if tg_op='UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'account_deletion_owner_immutable';
  end if;
  return new;
end;
$$;
create or replace function public.apply_account_deletion_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('requested','processing','completed') then
    perform public.withdraw_owner_businesses(new.user_id);
  end if;
  -- Rejection never republishes: a fresh admin decision is required.
  return new;
end;
$$;
create or replace function public.guard_user_deletion_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_business_owner_lifecycle(new.id);
  return new;
end;
$$;
create or replace function public.apply_user_deletion_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null then perform public.withdraw_owner_businesses(new.id); end if;
  return new;
end;
$$;
revoke all on function public.guard_account_deletion_lifecycle(),public.apply_account_deletion_lifecycle(),
  public.guard_user_deletion_lifecycle(),public.apply_user_deletion_lifecycle() from public,anon,authenticated;
drop trigger if exists account_deletion_lifecycle_guard on public.account_deletion_requests;
create trigger account_deletion_lifecycle_guard before insert or update on public.account_deletion_requests
  for each row execute function public.guard_account_deletion_lifecycle();
drop trigger if exists account_deletion_lifecycle_apply on public.account_deletion_requests;
create trigger account_deletion_lifecycle_apply after insert or update on public.account_deletion_requests
  for each row execute function public.apply_account_deletion_lifecycle();
drop trigger if exists users_deletion_lifecycle_guard on public.users;
create trigger users_deletion_lifecycle_guard before update of deleted_at on public.users
  for each row when (old.deleted_at is distinct from new.deleted_at) execute function public.guard_user_deletion_lifecycle();
drop trigger if exists users_deletion_lifecycle_apply on public.users;
create trigger users_deletion_lifecycle_apply after update of deleted_at on public.users
  for each row when (old.deleted_at is distinct from new.deleted_at) execute function public.apply_user_deletion_lifecycle();

create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_request public.account_deletion_requests%rowtype; v_count integer;
begin
  if v_actor is null or not exists(select 1 from public.users where id=v_actor and deleted_at is null) then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if char_length(p_reason)>1000 then raise exception 'invalid_deletion_reason'; end if;
  perform public.lock_business_owner_lifecycle(v_actor);
  if exists(select 1 from public.account_deletion_requests where user_id=v_actor and status='completed') then
    raise exception 'account_deletion_completed';
  end if;
  select count(*) into v_count from public.businesses where owner_user_id=v_actor
    and (status in ('published','pending_review') or verified_at is not null);
  select * into v_request from public.account_deletion_requests where user_id=v_actor
    and status in ('requested','processing') order by requested_at,id limit 1 for update;
  if not found then
    insert into public.account_deletion_requests(user_id,reason,status)
      values(v_actor,nullif(trim(p_reason),''),'requested') returning * into v_request;
  end if;
  perform public.withdraw_owner_businesses(v_actor);
  return jsonb_build_object('requested',true,'requestId',v_request.id,'status',v_request.status,'withdrawnBusinessCount',v_count);
end;
$$;
revoke all on function public.request_account_deletion(text) from public,anon;
grant execute on function public.request_account_deletion(text) to authenticated;

-- Repair only already-blocked owners. Never erase records or cancel bookings.
do $$ declare v_owner uuid; begin
  for v_owner in select distinct b.owner_user_id from public.businesses b
    where (b.status in ('published','pending_review') or b.verified_at is not null)
      and public.business_owner_lifecycle_blocked(b.owner_user_id)
    order by b.owner_user_id
  loop perform public.withdraw_owner_businesses(v_owner); end loop;
end $$;
notify pgrst, 'reload schema';
commit;
