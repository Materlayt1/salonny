-- Phase 2: apply only after 040-aware web/native API deployment is verified.
-- Restrictive ceilings also constrain any legacy permissive member policy.
-- No historical records, identities, appointments or balances are rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $$ begin
  if to_regclass('public.business_calendar_appointments') is null
    or to_regclass('public.business_inventory_access') is null
    or to_regclass('public.business_customer_totals') is null then
    raise exception 'SCOPED_PANEL_READ_VIEWS_REQUIRED';
  end if;
  if not exists(select 1 from pg_attribute where attrelid='auth.users'::regclass and attname='phone_confirmed_at' and not attisdropped) then
    raise exception 'VERIFIED_AUTH_PHONE_PREREQUISITE_REQUIRED';
  end if;
  if exists(select 1 from public.appointments a join public.customers c on c.id=a.customer_id where c.business_id<>a.business_id
      or (c.user_id is not null and a.customer_user_id is not null and c.user_id<>a.customer_user_id))
    or exists(select 1 from public.appointments a join public.branches b on b.id=a.branch_id where b.business_id<>a.business_id)
    or exists(select 1 from public.appointments a join public.employees e on e.id=a.employee_id where e.business_id<>a.business_id)
    or exists(select 1 from public.appointment_items i join public.appointments a on a.id=i.appointment_id where a.business_id<>i.business_id)
    or exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where c.business_id<>m.business_id)
    or exists(select 1 from public.employees where active and user_id is not null group by business_id,user_id having count(*)>1)
  then raise exception 'PRIVATE_ACCESS_EXISTING_DATA_REVIEW_REQUIRED: no rows changed' using errcode='23514'; end if;
end $$;

create policy private_appointments_read_ceiling on public.appointments as restrictive for select to authenticated
  using(customer_user_id=(select auth.uid()) or public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
create policy private_appointment_items_read_ceiling on public.appointment_items as restrictive for select to authenticated
  using(exists(select 1 from public.appointments a where a.id=appointment_id and a.business_id=appointment_items.business_id
    and (a.customer_user_id=(select auth.uid()) or public.has_business_role(a.business_id,array['OWNER','MANAGER']::public.business_member_role[]))));
create policy private_customers_ceiling on public.customers as restrictive for all to authenticated
  using(public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]))
  with check(public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
create policy private_payments_read_ceiling on public.payments as restrictive for select to authenticated
  using(customer_user_id=(select auth.uid()) or public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
create policy private_inventory_ceiling on public.inventory_products as restrictive for all to authenticated
  using(public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]))
  with check(public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
create policy private_inventory_movements_read_ceiling on public.inventory_transactions as restrictive for select to authenticated
  using(public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
create policy private_import_jobs_read_ceiling on public.data_import_jobs as restrictive for select to authenticated
  using(public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
create policy private_conversations_ceiling on public.conversations as restrictive for all to authenticated
  using(customer_user_id=(select auth.uid()) or public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]))
  with check(customer_user_id=(select auth.uid()) or public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[]));
create policy private_messages_ceiling on public.messages as restrictive for all to authenticated
  using(exists(select 1 from public.conversations c where c.id=conversation_id and c.business_id=messages.business_id
    and (c.customer_user_id=(select auth.uid()) or public.has_business_role(c.business_id,array['OWNER','MANAGER']::public.business_member_role[]))))
  with check(sender_user_id=(select auth.uid()) and exists(select 1 from public.conversations c where c.id=conversation_id and c.business_id=messages.business_id
    and (c.customer_user_id=(select auth.uid()) or public.has_business_role(c.business_id,array['OWNER','MANAGER']::public.business_member_role[]))));

revoke all on public.appointments,public.appointment_items,public.customers,public.payments,public.inventory_products,public.inventory_transactions,public.data_import_jobs,public.conversations,public.messages from public,anon;
-- RLS never protects TRUNCATE/REFERENCES/TRIGGER. Client roles need none of
-- these maintenance privileges on any application table, now or by default.
revoke truncate,references,trigger on all tables in schema public from public,anon,authenticated;
alter default privileges in schema public revoke truncate,references,trigger on tables from public,anon,authenticated;
do $$ declare r record; begin
  for r in select c.relname,a.attname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relname in('appointments','appointment_items','customers','payments','inventory_products','inventory_transactions','data_import_jobs','conversations','messages') and a.attnum>0 and not a.attisdropped and a.attacl is not null loop
    execute format('revoke select(%I),insert(%I),update(%I),references(%I) on public.%I from public,anon',r.attname,r.attname,r.attname,r.attname,r.relname);
  end loop;
  for r in select c.relname,a.attname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relkind in('r','p','v','m','f') and a.attnum>0 and not a.attisdropped and a.attacl is not null loop
    execute format('revoke references(%I) on public.%I from public,anon,authenticated',r.attname,r.relname);
  end loop;
end $$;
revoke insert,update,delete,truncate,references,trigger on public.appointments,public.appointment_items,public.payments,public.inventory_transactions,public.data_import_jobs from authenticated;
-- Old column grants must not preserve a mutation path after table revocation.
do $$ declare r record; begin
  for r in select c.relname,a.attname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relname in('appointments','appointment_items','payments','inventory_transactions','data_import_jobs') and a.attnum>0 and not a.attisdropped loop
    execute format('revoke insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',r.attname,r.attname,r.attname,r.relname);
  end loop;
end $$;

-- An assigned employee may transition only their own appointment with calendar
-- permission. Preserve existing idempotent status behavior, CRM, notices/audit
-- and lifecycle triggers; never grant arbitrary appointment row UPDATE.
create or replace function public.business_update_appointment_status(p_appointment_id uuid,p_status public.appointment_state)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_appointment public.appointments%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_status is null then raise exception 'invalid_appointment_transition' using errcode='22023'; end if;
  select a.* into v_appointment from public.appointments a where a.id=p_appointment_id and (
    public.has_business_role(a.business_id,array['OWNER','MANAGER']::public.business_member_role[]) or exists(
      select 1 from public.business_members m left join public.business_member_permissions p on p.business_id=m.business_id and p.user_id=m.user_id
      join public.branches b on b.id=a.branch_id and b.business_id=a.business_id and b.active
      where m.business_id=a.business_id and m.user_id=auth.uid() and m.active and m.role='EMPLOYEE'
        and coalesce(p.permissions->'calendar','true'::jsonb)='true'::jsonb
        and (select count(*)=1 and min(e.id::text)::uuid=a.employee_id from public.employees e where e.business_id=a.business_id and e.user_id=m.user_id and e.active)
    )) for update;
  if not found then raise exception 'appointment_access_denied' using errcode='42501'; end if;
  if v_appointment.status=p_status then return jsonb_build_object('id',v_appointment.id,'status',v_appointment.status); end if;
  if not ((v_appointment.status='pending' and p_status in('confirmed','cancelled')) or
    (v_appointment.status='confirmed' and p_status in('completed','cancelled','no_show'))) then
    raise exception 'invalid_appointment_transition' using errcode='22023';
  end if;
  update public.appointments set status=p_status,
    cancelled_at=case when p_status='cancelled' then now() else cancelled_at end,
    cancellation_reason=case when p_status='cancelled' then coalesce(cancellation_reason,'İşletme tarafından iptal edildi') else cancellation_reason end
    where id=v_appointment.id;
  if p_status='completed' then
    update public.customers set total_visits=total_visits+1,total_spend_minor=total_spend_minor+v_appointment.total_minor,
      last_visit_at=greatest(coalesce(last_visit_at,'-infinity'::timestamptz),v_appointment.starts_at) where id=v_appointment.customer_id;
  end if;
  if v_appointment.customer_user_id is not null then
    insert into public.notifications(user_id,business_id,appointment_id,type,title,body,data)
    values(v_appointment.customer_user_id,v_appointment.business_id,v_appointment.id,'appointment_status_changed','Randevu durumunuz güncellendi',
      case p_status when 'confirmed' then 'Randevunuz onaylandı.' when 'completed' then 'Randevunuz tamamlandı. Deneyiminizi puanlayabilirsiniz.'
        when 'cancelled' then 'Randevunuz işletme tarafından iptal edildi.' when 'no_show' then 'Randevunuz gelmedi olarak işaretlendi.' else 'Randevu durumunuz değişti.' end,
      jsonb_build_object('status',p_status));
  end if;
  insert into public.audit_logs(business_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(v_appointment.business_id,auth.uid(),'appointment.status_changed','appointment',v_appointment.id::text,
      jsonb_build_object('status',v_appointment.status),jsonb_build_object('status',p_status));
  return jsonb_build_object('id',v_appointment.id,'status',p_status);
end $$;

-- Stock writes already require owner/manager in both web/native APIs. Enforce
-- the same rule on direct RPC calls, without returning private purchase prices.
create or replace function public.adjust_inventory_stock(p_product_id uuid,p_quantity_delta numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_product public.inventory_products%rowtype; v_new_quantity numeric;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_quantity_delta is null or p_quantity_delta::text in('NaN','Infinity','-Infinity') or p_quantity_delta=0 or abs(p_quantity_delta)>1000000 then raise exception 'invalid_quantity' using errcode='22023'; end if;
  if char_length(coalesce(p_note,''))>500 then raise exception 'note_too_long' using errcode='22023'; end if;
  select p.* into v_product from public.inventory_products p where p.id=p_product_id
    and public.has_business_role(p.business_id,array['OWNER','MANAGER']::public.business_member_role[]) for update;
  if not found then raise exception 'inventory_access_denied' using errcode='42501'; end if;
  v_new_quantity:=v_product.stock_quantity+p_quantity_delta;
  if v_new_quantity<0 then raise exception 'insufficient_stock' using errcode='22023'; end if;
  update public.inventory_products set stock_quantity=v_new_quantity where id=v_product.id;
  insert into public.inventory_transactions(business_id,branch_id,product_id,movement,quantity,unit_cost_minor,note,created_by)
    values(v_product.business_id,v_product.branch_id,v_product.id,case when p_quantity_delta>0 then 'in'::public.inventory_movement else 'out'::public.inventory_movement end,
      abs(p_quantity_delta),v_product.purchase_price_minor,nullif(trim(coalesce(p_note,'')),''),auth.uid());
  insert into public.audit_logs(business_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(v_product.business_id,auth.uid(),'inventory.adjusted','inventory_product',v_product.id::text,
      jsonb_build_object('stock_quantity',v_product.stock_quantity),jsonb_build_object('stock_quantity',v_new_quantity,'delta',p_quantity_delta));
  return jsonb_build_object('id',v_product.id,'stock_quantity',v_new_quantity);
end $$;
revoke all on function public.business_update_appointment_status(uuid,public.appointment_state) from public,anon;
revoke all on function public.adjust_inventory_stock(uuid,numeric,text) from public,anon;
grant execute on function public.business_update_appointment_status(uuid,public.appointment_state) to authenticated;
grant execute on function public.adjust_inventory_stock(uuid,numeric,text) to authenticated;

-- Retire the broad legacy definer, not just its raw-table path. Current web
-- consumers use 040's selected-business owner/manager import instead.
revoke all on function public.bulk_import_customers(jsonb) from public,anon,authenticated;

-- Keep the existing series feature, but not its broad employee entry point or
-- unchecked slot creation. The entire series still commits or rolls back once.
create or replace function public.create_staff_appointment_series(
  p_customer_id uuid,p_employee_id uuid,p_service_id uuid,p_branch_id uuid,p_starts_at timestamptz,
  p_party_size integer default 1,p_repeat_count integer default 1,p_interval_days integer default 7,p_source text default 'staff'
) returns uuid[] language plpgsql security definer set search_path='' as $$
declare v_business uuid; v_customer_user uuid; v_timezone text; v_duration integer; v_buffer integer; v_price integer; v_name text; v_currency text;
  v_group uuid:=gen_random_uuid(); v_ids uuid[]:='{}'; v_id uuid; v_start timestamptz; v_day date; i integer;
begin
  select s.business_id into v_business from public.services s where s.id=p_service_id;
  if auth.uid() is null or not exists(select 1 from public.business_members m where m.business_id=v_business and m.user_id=auth.uid() and m.active and m.role in('OWNER','MANAGER'))
    then raise exception 'business_manager_required' using errcode='42501'; end if;
  if p_starts_at is null or not isfinite(p_starts_at) or p_party_size is null or p_party_size not between 1 and 50
    or p_repeat_count is null or p_repeat_count not between 1 and 52 or p_interval_days is null or p_interval_days not between 1 and 365
    or p_source is null or p_source not in('marketplace','direct_link','widget','walk_in','staff') then raise exception 'invalid_series' using errcode='22023'; end if;
  select c.user_id into v_customer_user from public.customers c where c.id=p_customer_id and c.business_id=v_business;
  if not found then raise exception 'invalid_customer' using errcode='22023'; end if;
  select b.timezone,s.name,s.currency,s.buffer_after_minutes,coalesce(es.duration_override_minutes,s.duration_minutes),coalesce(es.price_override_minor,bs.price_override_minor,s.price_minor)
    into v_timezone,v_name,v_currency,v_buffer,v_duration,v_price
    from public.branches b join public.services s on s.business_id=b.business_id and s.id=p_service_id and s.active
    join public.branch_services bs on bs.branch_id=b.id and bs.service_id=s.id and bs.active
    join public.employees e on e.id=p_employee_id and e.business_id=b.business_id and e.active
    join public.employee_branches eb on eb.branch_id=b.id and eb.employee_id=e.id
    join public.employee_services es on es.employee_id=e.id and es.service_id=s.id
    where b.id=p_branch_id and b.business_id=v_business and b.active;
  if not found then raise exception 'booking_configuration_not_found' using errcode='22023'; end if;
  if exists(select 1 from public.service_resources sr join public.business_resources r on r.id=sr.resource_id
    where sr.service_id=p_service_id and (r.business_id<>v_business or (r.branch_id=p_branch_id and not r.active))) then raise exception 'resource_conflict' using errcode='23P01'; end if;
  for i in 0..p_repeat_count-1 loop
    -- Recurrences keep the branch's wall-clock time across DST transitions.
    v_start:=((p_starts_at at time zone v_timezone)+make_interval(days=>i*p_interval_days)) at time zone v_timezone;
    v_day:=(v_start at time zone v_timezone)::date;
    perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text||v_day::text,0));
    perform 1 from public.get_booking_slots(v_business,p_branch_id,p_employee_id,p_service_id,v_day) slot where slot.starts_at=v_start;
    if not found then raise exception 'slot_not_available' using errcode='23P01'; end if;
    insert into public.appointments(business_id,branch_id,customer_id,customer_user_id,employee_id,status,starts_at,ends_at,total_minor,currency,created_by,source,party_size,recurrence_group_id,recurrence_rule)
      values(v_business,p_branch_id,p_customer_id,v_customer_user,p_employee_id,'confirmed',v_start,v_start+make_interval(mins=>v_duration+v_buffer),v_price,v_currency,auth.uid(),p_source,p_party_size,
        case when p_repeat_count>1 then v_group end,case when p_repeat_count>1 then 'FREQ=DAILY;INTERVAL='||p_interval_days||';COUNT='||p_repeat_count end) returning id into v_id;
    insert into public.appointment_items(appointment_id,business_id,service_id,employee_id,name_snapshot,duration_minutes,price_minor)
      values(v_id,v_business,p_service_id,p_employee_id,v_name,v_duration,v_price);
    v_ids:=array_append(v_ids,v_id);
  end loop;
  insert into public.audit_logs(business_id,actor_user_id,action,entity_type,entity_id,after_data)
    values(v_business,auth.uid(),'appointment.series_created','appointment_series',v_group::text,jsonb_build_object('appointment_ids',v_ids,'branch_id',p_branch_id));
  return v_ids;
end $$;
revoke all on function public.create_staff_appointment_series(uuid,uuid,uuid,uuid,timestamptz,integer,integer,integer,text) from public,anon;
grant execute on function public.create_staff_appointment_series(uuid,uuid,uuid,uuid,timestamptz,integer,integer,integer,text) to authenticated;

-- Auth's confirmed phone is trusted; editable public.users.phone and user
-- metadata are not proof. Local TR formatting aliases are equivalent, suffix
-- matches and arbitrary country-code stripping are deliberately not accepted.
create function public.customer_identity_phone_key(p_phone text) returns text language sql immutable security invoker set search_path='' as $$
  select case when length(n)=11 and n like '0%' then '90'||substr(n,2)
    when length(n)=10 then '90'||n else n end from(select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') n) digits;
$$;
revoke all on function public.customer_identity_phone_key(text) from public,anon,authenticated;
create function public.guard_customer_account_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.business_id is distinct from old.business_id) then
    raise exception 'customer_scope_immutable' using errcode='23514';
  end if;
  if tg_op='UPDATE' and new.user_id is not distinct from old.user_id then return new; end if;
  if coalesce(auth.role(),'')='service_role' then return new; end if;
  if tg_op='INSERT' then
    if new.user_id is null or new.user_id=auth.uid() then return new; end if;
  elsif old.user_id is null and new.user_id=auth.uid() and exists(
    select 1 from auth.users u where u.id=auth.uid() and u.phone_confirmed_at is not null and u.phone is not null
      and public.customer_identity_phone_key(u.phone)=public.customer_identity_phone_key(new.phone)
      and public.customer_identity_phone_key(old.phone)=public.customer_identity_phone_key(new.phone)
      and length(public.customer_identity_phone_key(u.phone)) between 10 and 15
  ) then return new;
  end if;
  raise exception 'customer_identity_verification_required' using errcode='42501';
end $$;
revoke all on function public.guard_customer_account_identity() from public,anon,authenticated;
create trigger customer_account_identity_guard before insert or update of id,business_id,user_id on public.customers
  for each row execute function public.guard_customer_account_identity();
notify pgrst,'reload schema';
commit;
