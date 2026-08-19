-- Tenant-safe dynamic operations and privilege hardening.
-- Sensitive state transitions are performed only through audited security-definer functions.

create index if not exists business_members_user_active_created_idx
  on public.business_members(user_id, active, created_at);
create index if not exists appointments_business_status_starts_idx
  on public.appointments(business_id, status, starts_at desc);
create index if not exists appointments_customer_status_starts_idx
  on public.appointments(customer_user_id, status, starts_at desc);
create index if not exists payments_business_status_created_idx
  on public.payments(business_id, status, created_at desc);
create index if not exists customers_business_created_idx
  on public.customers(business_id, created_at desc);
create index if not exists campaigns_business_status_created_idx
  on public.campaigns(business_id, status, created_at desc);
create index if not exists inventory_products_business_active_idx
  on public.inventory_products(business_id, active, created_at desc);
create index if not exists inventory_transactions_product_created_idx
  on public.inventory_transactions(product_id, created_at desc);
create index if not exists reviews_business_moderation_created_idx
  on public.reviews(business_id, moderation_status, created_at desc);
create index if not exists reviews_customer_appointment_idx
  on public.reviews(customer_user_id, appointment_id);
create index if not exists employee_hours_employee_branch_weekday_idx
  on public.employee_working_hours(employee_id, branch_id, weekday);
create index if not exists employee_time_off_employee_starts_idx
  on public.employee_time_off(employee_id, starts_at, ends_at);

-- A customer may edit profile fields, but can never promote their own role.
revoke update on table public.users from authenticated;
grant update (full_name, phone, avatar_path, city, locale, timezone, deleted_at, updated_at)
  on table public.users to authenticated;

-- Owners can edit public profile content, but moderation and ownership fields are admin-only.
revoke update on table public.businesses from authenticated;
grant update (category_id, name, slug, description, phone, email, whatsapp_phone, website_url, timezone, onboarding_completed_at, updated_at)
  on table public.businesses to authenticated;

-- Appointment state, review creation and immutable ledgers go through audited RPCs.
revoke update on table public.appointments from authenticated;
revoke insert on table public.reviews from authenticated;
revoke update on table public.reviews from authenticated;
grant update (business_reply, replied_at) on table public.reviews to authenticated;
revoke update on table public.notifications from authenticated;
grant update (read_at) on table public.notifications to authenticated;
revoke update, delete on table public.inventory_transactions from authenticated;

drop policy if exists reviews_customer_insert on public.reviews;
drop policy if exists reviews_business_reply on public.reviews;
create policy reviews_business_reply on public.reviews for update to authenticated
  using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]))
  with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));

drop policy if exists inventory_products_tenant on public.inventory_products;
create policy inventory_products_tenant_read on public.inventory_products for select to authenticated
  using (public.is_business_member(business_id));
create policy inventory_products_tenant_manage on public.inventory_products for all to authenticated
  using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]))
  with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));

drop policy if exists inventory_transactions_tenant on public.inventory_transactions;
create policy inventory_transactions_tenant_read on public.inventory_transactions for select to authenticated
  using (public.is_business_member(business_id));

-- Booking is accepted only when the requested timestamp is still a generated valid slot.
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
  v_service_name text;
  v_service_currency text;
  v_buffer_after integer;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_duration integer;
  v_price integer;
  v_ends_at timestamptz;
  v_existing public.appointments%rowtype;
  v_timezone text;
  v_local_date date;
  v_auto_confirm boolean;
  v_status public.appointment_state;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 160 then
    raise exception 'invalid_idempotency_key';
  end if;
  if char_length(trim(coalesce(p_customer_name, ''))) not between 2 and 120 then raise exception 'invalid_customer_name'; end if;
  if char_length(trim(coalesce(p_customer_phone, ''))) not between 10 and 24 then raise exception 'invalid_customer_phone'; end if;
  if p_customer_email is not null and char_length(trim(p_customer_email)) > 254 then raise exception 'invalid_customer_email'; end if;

  select * into v_existing
  from public.appointments
  where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.customer_user_id = auth.uid() then return v_existing.id; end if;
    raise exception 'idempotency_key_conflict' using errcode = '23505';
  end if;

  select s.name, s.currency, s.buffer_after_minutes, b.timezone,
         coalesce(es.duration_override_minutes, s.duration_minutes),
         coalesce(es.price_override_minor, bs.price_override_minor, s.price_minor),
         coalesce(settings.auto_confirm, true)
  into strict v_service_name, v_service_currency, v_buffer_after, v_timezone,
              v_duration, v_price, v_auto_confirm
  from public.services s
  join public.businesses b on b.id = s.business_id and b.status = 'published'
  join public.branches branch on branch.id = p_branch_id and branch.business_id = b.id and branch.active
  join public.branch_services bs on bs.service_id = s.id and bs.branch_id = branch.id and bs.active
  join public.employees e on e.id = p_employee_id and e.business_id = b.id and e.active
  join public.employee_services es on es.service_id = s.id and es.employee_id = e.id
  join public.employee_branches eb on eb.employee_id = e.id and eb.branch_id = branch.id
  left join public.business_settings settings on settings.business_id = b.id
  where s.id = p_service_id and s.business_id = p_business_id and s.active;

  v_local_date := (p_starts_at at time zone v_timezone)::date;
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text || v_local_date::text, 0));

  perform 1
  from public.get_booking_slots(p_business_id, p_branch_id, p_employee_id, p_service_id, v_local_date) slot
  where slot.starts_at = p_starts_at;
  if not found then raise exception 'slot_not_available' using errcode = '23P01'; end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration + v_buffer_after);
  v_status := case when v_auto_confirm then 'confirmed'::public.appointment_state else 'pending'::public.appointment_state end;

  insert into public.customers (business_id, user_id, full_name, phone, email)
  values (p_business_id, auth.uid(), trim(p_customer_name), trim(p_customer_phone), nullif(trim(coalesce(p_customer_email, '')), ''))
  on conflict (business_id, phone) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    user_id = coalesce(public.customers.user_id, excluded.user_id)
  returning id into v_customer_id;

  insert into public.appointments
    (business_id, branch_id, customer_id, customer_user_id, employee_id, status, starts_at, ends_at, total_minor, currency, idempotency_key, created_by)
  values
    (p_business_id, p_branch_id, v_customer_id, auth.uid(), p_employee_id, v_status, p_starts_at, v_ends_at, v_price, v_service_currency, p_idempotency_key, auth.uid())
  returning id into v_appointment_id;

  insert into public.appointment_items
    (appointment_id, business_id, service_id, employee_id, name_snapshot, duration_minutes, price_minor)
  values
    (v_appointment_id, p_business_id, p_service_id, p_employee_id, v_service_name, v_duration, v_price);

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body)
  values (
    auth.uid(), p_business_id, v_appointment_id,
    case when v_status = 'confirmed' then 'appointment_confirmed' else 'appointment_pending' end,
    case when v_status = 'confirmed' then 'Randevunuz onaylandı' else 'Randevu talebiniz alındı' end,
    v_service_name || ' randevunuz oluşturuldu.'
  );

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body)
  select bm.user_id, p_business_id, v_appointment_id, 'new_appointment', 'Yeni randevu', trim(p_customer_name) || ' için ' || v_service_name
  from public.business_members bm
  where bm.business_id = p_business_id and bm.active and bm.role in ('OWNER', 'MANAGER') and bm.user_id <> auth.uid();

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_business_id, auth.uid(), 'appointment.created', 'appointment', v_appointment_id::text,
    jsonb_build_object('status', v_status, 'starts_at', p_starts_at, 'employee_id', p_employee_id, 'service_id', p_service_id));

  return v_appointment_id;
exception
  when exclusion_violation then raise exception 'appointment_conflict' using errcode = '23P01';
  when no_data_found then raise exception 'booking_configuration_not_found';
end;
$$;

-- Only the customer who completed the linked appointment can create its single review.
create or replace function public.create_verified_review(
  p_appointment_id uuid,
  p_rating integer,
  p_comment text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_appointment public.appointments%rowtype;
  v_review public.reviews%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_rating not between 1 and 5 then raise exception 'invalid_rating'; end if;
  if char_length(trim(coalesce(p_comment, ''))) > 2000 then raise exception 'comment_too_long'; end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id and customer_user_id = auth.uid()
  for update;
  if not found then raise exception 'appointment_not_found'; end if;
  if v_appointment.status <> 'completed' then raise exception 'appointment_not_completed'; end if;

  insert into public.reviews (business_id, appointment_id, customer_user_id, rating, comment)
  values (v_appointment.business_id, v_appointment.id, auth.uid(), p_rating, nullif(trim(coalesce(p_comment, '')), ''))
  returning * into v_review;

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body, data)
  select bm.user_id, v_appointment.business_id, v_appointment.id, 'new_review', 'Yeni doğrulanmış değerlendirme',
    p_rating::text || ' yıldızlı bir değerlendirme aldınız.', jsonb_build_object('review_id', v_review.id, 'rating', p_rating)
  from public.business_members bm
  where bm.business_id = v_appointment.business_id and bm.active and bm.role in ('OWNER', 'MANAGER');

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (v_appointment.business_id, auth.uid(), 'review.created', 'review', v_review.id::text,
    jsonb_build_object('appointment_id', v_appointment.id, 'rating', p_rating, 'moderation_status', v_review.moderation_status));

  return jsonb_build_object('id', v_review.id, 'rating', v_review.rating, 'comment', v_review.comment, 'moderation_status', v_review.moderation_status);
exception when unique_violation then
  raise exception 'review_already_exists' using errcode = '23505';
end;
$$;

-- Ratings are derived only from approved, verified appointment reviews.
create or replace function public.refresh_business_rating(p_business_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.businesses b
  set rating_average = summary.average_rating,
      review_count = summary.review_total,
      updated_at = now()
  from (
    select coalesce(round(avg(r.rating)::numeric, 2), 0) as average_rating,
           count(r.id)::integer as review_total
    from public.reviews r
    where r.business_id = p_business_id and r.moderation_status = 'approved'
  ) summary
  where b.id = p_business_id
$$;

create or replace function public.handle_review_rating_change()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_business_rating(new.business_id);
  elsif tg_op = 'DELETE' then
    perform public.refresh_business_rating(old.business_id);
  else
    perform public.refresh_business_rating(old.business_id);
    if new.business_id <> old.business_id then
      perform public.refresh_business_rating(new.business_id);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reviews_refresh_business_rating on public.reviews;
create trigger reviews_refresh_business_rating
after insert or update of rating, moderation_status, business_id or delete on public.reviews
for each row execute function public.handle_review_rating_change();

-- Append-only stock movement with a locked balance update.
create or replace function public.adjust_inventory_stock(
  p_product_id uuid,
  p_quantity_delta numeric,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_product public.inventory_products%rowtype;
  v_new_quantity numeric;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_quantity_delta is null or p_quantity_delta = 0 or abs(p_quantity_delta) > 1000000 then raise exception 'invalid_quantity'; end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'note_too_long'; end if;

  select * into v_product from public.inventory_products where id = p_product_id for update;
  if not found then raise exception 'product_not_found'; end if;
  if not public.has_business_role(v_product.business_id, array['OWNER','MANAGER','EMPLOYEE']::public.business_member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_new_quantity := v_product.stock_quantity + p_quantity_delta;
  if v_new_quantity < 0 then raise exception 'insufficient_stock'; end if;

  update public.inventory_products set stock_quantity = v_new_quantity where id = v_product.id;
  insert into public.inventory_transactions
    (business_id, branch_id, product_id, movement, quantity, unit_cost_minor, note, created_by)
  values
    (v_product.business_id, v_product.branch_id, v_product.id,
     case when p_quantity_delta > 0 then 'in'::public.inventory_movement else 'out'::public.inventory_movement end,
     abs(p_quantity_delta), v_product.purchase_price_minor, nullif(trim(coalesce(p_note, '')), ''), auth.uid());

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (v_product.business_id, auth.uid(), 'inventory.adjusted', 'inventory_product', v_product.id::text,
    jsonb_build_object('stock_quantity', v_product.stock_quantity), jsonb_build_object('stock_quantity', v_new_quantity, 'delta', p_quantity_delta));
  return jsonb_build_object('id', v_product.id, 'stock_quantity', v_new_quantity);
end;
$$;

-- Campaign and discount are created together to prevent half-saved promotions.
create or replace function public.create_business_campaign(
  p_name text,
  p_code text,
  p_kind text,
  p_value integer,
  p_audience text default 'all',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_business_id uuid;
  v_campaign_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select bm.business_id into v_business_id
  from public.business_members bm
  where bm.user_id = auth.uid() and bm.active and bm.role in ('OWNER', 'MANAGER')
  order by bm.created_at limit 1;
  if v_business_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 140 then raise exception 'invalid_campaign_name'; end if;
  if upper(trim(coalesce(p_code, ''))) !~ '^[A-Z0-9_-]{3,30}$' then raise exception 'invalid_campaign_code'; end if;
  if p_kind not in ('percentage', 'fixed') or p_value <= 0 or (p_kind = 'percentage' and p_value > 100) then raise exception 'invalid_discount'; end if;
  if p_audience not in ('all', 'new', 'loyal', 'inactive') then raise exception 'invalid_audience'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then raise exception 'invalid_campaign_dates'; end if;

  insert into public.campaigns (business_id, name, audience_filter, content, status, scheduled_at, created_by)
  values (v_business_id, trim(p_name), jsonb_build_object('segment', p_audience),
    jsonb_build_object('discount_code', upper(trim(p_code))),
    case when p_starts_at is not null and p_starts_at > now() then 'scheduled' else 'active' end,
    p_starts_at, auth.uid()) returning id into v_campaign_id;
  insert into public.discounts (business_id, campaign_id, code, kind, value, starts_at, ends_at, active)
  values (v_business_id, v_campaign_id, upper(trim(p_code)), p_kind, p_value, p_starts_at, p_ends_at, true);
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (v_business_id, auth.uid(), 'campaign.created', 'campaign', v_campaign_id::text,
    jsonb_build_object('code', upper(trim(p_code)), 'kind', p_kind, 'value', p_value, 'audience', p_audience));
  return v_campaign_id;
end;
$$;

create or replace function public.set_business_campaign_status(
  p_campaign_id uuid,
  p_status text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.campaigns%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_status not in ('draft', 'active', 'cancelled') then raise exception 'invalid_campaign_status'; end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if not public.has_business_role(v_campaign.business_id, array['OWNER','MANAGER']::public.business_member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.campaigns set status = p_status where id = v_campaign.id;
  update public.discounts set active = (p_status = 'active') where campaign_id = v_campaign.id;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (v_campaign.business_id, auth.uid(), 'campaign.status_changed', 'campaign', v_campaign.id::text,
    jsonb_build_object('status', v_campaign.status), jsonb_build_object('status', p_status));
  return jsonb_build_object('id', v_campaign.id, 'status', p_status);
end;
$$;

-- Enforce a small, explicit appointment state machine and update CRM totals once.
create or replace function public.business_update_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_state
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_appointment public.appointments%rowtype;
  v_allowed boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'appointment_not_found'; end if;
  if not public.has_business_role(v_appointment.business_id, array['OWNER','MANAGER','EMPLOYEE']::public.business_member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_appointment.status = p_status then
    return jsonb_build_object('id', v_appointment.id, 'status', v_appointment.status);
  end if;
  v_allowed :=
    (v_appointment.status = 'pending' and p_status in ('confirmed', 'cancelled')) or
    (v_appointment.status = 'confirmed' and p_status in ('completed', 'cancelled', 'no_show'));
  if not v_allowed then raise exception 'invalid_appointment_transition'; end if;

  update public.appointments
  set status = p_status,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
      cancellation_reason = case when p_status = 'cancelled' then coalesce(cancellation_reason, 'İşletme tarafından iptal edildi') else cancellation_reason end
  where id = v_appointment.id;

  if p_status = 'completed' then
    update public.customers
    set total_visits = total_visits + 1,
        total_spend_minor = total_spend_minor + v_appointment.total_minor,
        last_visit_at = greatest(coalesce(last_visit_at, '-infinity'::timestamptz), v_appointment.starts_at)
    where id = v_appointment.customer_id;
  end if;

  if v_appointment.customer_user_id is not null then
    insert into public.notifications (user_id, business_id, appointment_id, type, title, body, data)
    values (v_appointment.customer_user_id, v_appointment.business_id, v_appointment.id,
      'appointment_status_changed', 'Randevu durumunuz güncellendi',
      case p_status when 'confirmed' then 'Randevunuz onaylandı.' when 'completed' then 'Randevunuz tamamlandı. Deneyiminizi puanlayabilirsiniz.' when 'cancelled' then 'Randevunuz işletme tarafından iptal edildi.' when 'no_show' then 'Randevunuz gelmedi olarak işaretlendi.' else 'Randevu durumunuz değişti.' end,
      jsonb_build_object('status', p_status));
  end if;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (v_appointment.business_id, auth.uid(), 'appointment.status_changed', 'appointment', v_appointment.id::text,
    jsonb_build_object('status', v_appointment.status), jsonb_build_object('status', p_status));
  return jsonb_build_object('id', v_appointment.id, 'status', p_status);
end;
$$;

revoke all on function public.create_appointment_atomic(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text) from public;
revoke all on function public.create_verified_review(uuid,integer,text) from public;
revoke all on function public.refresh_business_rating(uuid) from public;
revoke all on function public.handle_review_rating_change() from public;
revoke all on function public.adjust_inventory_stock(uuid,numeric,text) from public;
revoke all on function public.create_business_campaign(text,text,text,integer,text,timestamptz,timestamptz) from public;
revoke all on function public.set_business_campaign_status(uuid,text) from public;
revoke all on function public.business_update_appointment_status(uuid,public.appointment_state) from public;

grant execute on function public.create_appointment_atomic(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text) to authenticated;
grant execute on function public.create_verified_review(uuid,integer,text) to authenticated;
grant execute on function public.adjust_inventory_stock(uuid,numeric,text) to authenticated;
grant execute on function public.create_business_campaign(text,text,text,integer,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.set_business_campaign_status(uuid,text) to authenticated;
grant execute on function public.business_update_appointment_status(uuid,public.appointment_state) to authenticated;
