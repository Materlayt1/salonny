-- Customer appointment management: real list, availability, cancellation and rescheduling.

create or replace function public.get_customer_appointments()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'business_id', a.business_id,
    'business_slug', b.slug,
    'business_name', b.name,
    'business_image_path', image_row.storage_path,
    'service_id', item_row.service_id,
    'service_name', item_row.name_snapshot,
    'employee_id', a.employee_id,
    'employee_name', e.display_name,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'duration_minutes', item_row.duration_minutes,
    'total_minor', a.total_minor,
    'currency', a.currency,
    'status', a.status,
    'address', location_row.address_line,
    'district', location_row.district,
    'city', location_row.city,
    'latitude', location_row.latitude,
    'longitude', location_row.longitude,
    'can_cancel', a.status in ('pending', 'confirmed') and a.starts_at > now() + make_interval(mins => coalesce(settings.cancellation_notice_minutes, 1440)),
    'can_reschedule', a.status in ('pending', 'confirmed') and a.starts_at > now() + make_interval(mins => coalesce(settings.minimum_notice_minutes, 120)),
    'cancellation_notice_minutes', coalesce(settings.cancellation_notice_minutes, 1440),
    'minimum_notice_minutes', coalesce(settings.minimum_notice_minutes, 120)
  ) order by a.starts_at desc), '[]'::jsonb)
  into v_result
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  join public.employees e on e.id = a.employee_id
  left join public.business_settings settings on settings.business_id = a.business_id
  left join lateral (
    select ai.service_id, ai.name_snapshot, ai.duration_minutes
    from public.appointment_items ai
    where ai.appointment_id = a.id
    order by ai.sort_order, ai.id
    limit 1
  ) item_row on true
  left join lateral (
    select bi.storage_path
    from public.business_images bi
    where bi.business_id = a.business_id
      and (bi.branch_id is null or bi.branch_id = a.branch_id)
    order by case bi.kind when 'cover' then 0 when 'logo' then 1 else 2 end, bi.sort_order, bi.created_at
    limit 1
  ) image_row on true
  left join lateral (
    select bl.address_line, bl.district, bl.city, bl.latitude, bl.longitude
    from public.business_locations bl
    where bl.business_id = a.business_id
      and (bl.branch_id = a.branch_id or bl.branch_id is null)
    order by case when bl.branch_id = a.branch_id then 0 else 1 end, bl.created_at
    limit 1
  ) location_row on true
  where a.customer_user_id = auth.uid();

  return v_result;
end;
$$;

create or replace function public.get_appointment_reschedule_slots(
  p_appointment_id uuid,
  p_date date
) returns table(starts_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_timezone text;
  v_duration integer;
  v_buffer_after integer;
  v_weekday integer;
  v_booking_window integer;
  v_minimum_notice integer;
  v_local_today date;
  v_has_employee_hours boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id and customer_user_id = auth.uid();

  if not found then raise exception 'appointment_not_found'; end if;
  if v_appointment.status not in ('pending', 'confirmed') then raise exception 'appointment_not_changeable'; end if;

  select b.timezone,
         coalesce(s.duration_minutes, extract(epoch from (v_appointment.ends_at - v_appointment.starts_at))::integer / 60),
         coalesce(s.buffer_after_minutes, 0),
         coalesce(bs.booking_window_days, 60),
         coalesce(bs.minimum_notice_minutes, 120)
  into v_timezone, v_duration, v_buffer_after, v_booking_window, v_minimum_notice
  from public.businesses b
  left join public.business_settings bs on bs.business_id = b.id
  left join public.appointment_items ai on ai.appointment_id = v_appointment.id
  left join public.services s on s.id = ai.service_id
  where b.id = v_appointment.business_id
  order by ai.sort_order nulls last
  limit 1;

  v_local_today := (now() at time zone v_timezone)::date;
  if p_date < v_local_today or p_date > v_local_today + v_booking_window then return; end if;
  v_weekday := extract(isodow from p_date)::integer - 1;

  select exists(
    select 1 from public.employee_working_hours ewh
    where ewh.employee_id = v_appointment.employee_id
      and ewh.branch_id = v_appointment.branch_id
      and ewh.weekday = v_weekday
      and (ewh.valid_from is null or ewh.valid_from <= p_date)
      and (ewh.valid_until is null or ewh.valid_until >= p_date)
  ) into v_has_employee_hours;

  return query
  with working_periods as (
    select ewh.starts_at, ewh.ends_at
    from public.employee_working_hours ewh
    where v_has_employee_hours
      and ewh.employee_id = v_appointment.employee_id
      and ewh.branch_id = v_appointment.branch_id
      and ewh.weekday = v_weekday
      and (ewh.valid_from is null or ewh.valid_from <= p_date)
      and (ewh.valid_until is null or ewh.valid_until >= p_date)
    union all
    select bh.opens_at, bh.closes_at
    from public.business_hours bh
    where not v_has_employee_hours
      and bh.branch_id = v_appointment.branch_id
      and bh.weekday = v_weekday
      and not bh.is_closed
      and (bh.valid_from is null or bh.valid_from <= p_date)
      and (bh.valid_until is null or bh.valid_until >= p_date)
  ), candidate_slots as (
    select generated.local_start,
           generated.local_start + make_interval(mins => v_duration + v_buffer_after) as local_end
    from working_periods wp
    cross join lateral generate_series(
      p_date + wp.starts_at,
      p_date + wp.ends_at - make_interval(mins => v_duration + v_buffer_after),
      interval '30 minutes'
    ) as generated(local_start)
  ), zoned_slots as (
    select cs.local_start at time zone v_timezone as slot_start,
           cs.local_end at time zone v_timezone as slot_end,
           cs.local_start::time as local_start_time,
           cs.local_end::time as local_end_time
    from candidate_slots cs
  )
  select zs.slot_start
  from zoned_slots zs
  where zs.slot_start >= now() + make_interval(mins => v_minimum_notice)
    and not exists (
      select 1 from public.business_breaks bb
      where bb.branch_id = v_appointment.branch_id
        and bb.weekday = v_weekday
        and tsrange(p_date + bb.starts_at, p_date + bb.ends_at, '[)') &&
            tsrange(p_date + zs.local_start_time, p_date + zs.local_end_time, '[)')
    )
    and not exists (
      select 1 from public.employee_time_off eto
      where eto.employee_id = v_appointment.employee_id
        and tstzrange(eto.starts_at, eto.ends_at, '[)') && tstzrange(zs.slot_start, zs.slot_end, '[)')
    )
    and not exists (
      select 1 from public.appointments other
      where other.employee_id = v_appointment.employee_id
        and other.id <> v_appointment.id
        and other.status in ('pending', 'confirmed')
        and tstzrange(other.starts_at, other.ends_at, '[)') && tstzrange(zs.slot_start, zs.slot_end, '[)')
    )
  order by zs.slot_start;
end;
$$;

create or replace function public.cancel_customer_appointment(
  p_appointment_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_notice integer;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;

  select a.* into v_appointment
  from public.appointments a
  where a.id = p_appointment_id and a.customer_user_id = auth.uid()
  for update of a;

  if not found then raise exception 'appointment_not_found'; end if;
  select coalesce(bs.cancellation_notice_minutes, 1440) into v_notice
  from public.businesses b
  left join public.business_settings bs on bs.business_id = b.id
  where b.id = v_appointment.business_id;
  if v_appointment.status not in ('pending', 'confirmed') then raise exception 'appointment_not_changeable'; end if;
  if v_appointment.starts_at <= now() + make_interval(mins => v_notice) then raise exception 'cancellation_window_closed'; end if;

  v_reason := left(coalesce(nullif(trim(p_reason), ''), 'Müşteri tarafından iptal edildi'), 500);
  update public.appointments
  set status = 'cancelled', cancellation_reason = v_reason, cancelled_at = now()
  where id = v_appointment.id;

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body)
  values (auth.uid(), v_appointment.business_id, v_appointment.id, 'appointment_cancelled', 'Randevunuz iptal edildi', 'Randevu iptal işleminiz tamamlandı.');

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body)
  select bm.user_id, v_appointment.business_id, v_appointment.id, 'appointment_cancelled_by_customer', 'Müşteri randevuyu iptal etti', v_reason
  from public.business_members bm
  where bm.business_id = v_appointment.business_id and bm.active and bm.role in ('OWNER', 'MANAGER') and bm.user_id <> auth.uid();

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (v_appointment.business_id, auth.uid(), 'appointment.customer_cancelled', 'appointment', v_appointment.id::text,
    jsonb_build_object('status', v_appointment.status, 'starts_at', v_appointment.starts_at),
    jsonb_build_object('status', 'cancelled', 'reason', v_reason));

  return jsonb_build_object('id', v_appointment.id, 'status', 'cancelled');
end;
$$;

create or replace function public.reschedule_customer_appointment(
  p_appointment_id uuid,
  p_new_starts_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_timezone text;
  v_duration integer;
  v_buffer_after integer;
  v_minimum_notice integer;
  v_new_ends_at timestamptz;
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday integer;
  v_has_employee_hours boolean;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id and customer_user_id = auth.uid()
  for update;

  if not found then raise exception 'appointment_not_found'; end if;
  if v_appointment.status not in ('pending', 'confirmed') then raise exception 'appointment_not_changeable'; end if;

  select b.timezone,
         coalesce(s.duration_minutes, extract(epoch from (v_appointment.ends_at - v_appointment.starts_at))::integer / 60),
         coalesce(s.buffer_after_minutes, 0),
         coalesce(bs.minimum_notice_minutes, 120)
  into v_timezone, v_duration, v_buffer_after, v_minimum_notice
  from public.businesses b
  left join public.business_settings bs on bs.business_id = b.id
  left join public.appointment_items ai on ai.appointment_id = v_appointment.id
  left join public.services s on s.id = ai.service_id
  where b.id = v_appointment.business_id
  order by ai.sort_order nulls last
  limit 1;

  if p_new_starts_at < now() + make_interval(mins => v_minimum_notice) then raise exception 'minimum_notice_required'; end if;

  v_new_ends_at := p_new_starts_at + make_interval(mins => v_duration + v_buffer_after);
  v_local_start := p_new_starts_at at time zone v_timezone;
  v_local_end := v_new_ends_at at time zone v_timezone;
  if v_local_start::date <> v_local_end::date then raise exception 'outside_working_hours'; end if;
  v_weekday := extract(isodow from v_local_start)::integer - 1;

  select exists(
    select 1 from public.employee_working_hours ewh
    where ewh.employee_id = v_appointment.employee_id
      and ewh.branch_id = v_appointment.branch_id
      and ewh.weekday = v_weekday
      and (ewh.valid_from is null or ewh.valid_from <= v_local_start::date)
      and (ewh.valid_until is null or ewh.valid_until >= v_local_start::date)
  ) into v_has_employee_hours;

  if v_has_employee_hours then
    if not exists (
      select 1 from public.employee_working_hours ewh
      where ewh.employee_id = v_appointment.employee_id and ewh.branch_id = v_appointment.branch_id and ewh.weekday = v_weekday
        and v_local_start::time >= ewh.starts_at and v_local_end::time <= ewh.ends_at
        and (ewh.valid_from is null or ewh.valid_from <= v_local_start::date)
        and (ewh.valid_until is null or ewh.valid_until >= v_local_start::date)
    ) then raise exception 'outside_working_hours'; end if;
  elsif not exists (
    select 1 from public.business_hours bh
    where bh.branch_id = v_appointment.branch_id and bh.weekday = v_weekday and not bh.is_closed
      and v_local_start::time >= bh.opens_at and v_local_end::time <= bh.closes_at
      and (bh.valid_from is null or bh.valid_from <= v_local_start::date)
      and (bh.valid_until is null or bh.valid_until >= v_local_start::date)
  ) then raise exception 'outside_working_hours'; end if;

  if exists (
    select 1 from public.business_breaks bb
    where bb.branch_id = v_appointment.branch_id and bb.weekday = v_weekday
      and tsrange(v_local_start::date + bb.starts_at, v_local_start::date + bb.ends_at, '[)') && tsrange(v_local_start, v_local_end, '[)')
  ) then raise exception 'appointment_conflict'; end if;

  if exists (
    select 1 from public.employee_time_off eto
    where eto.employee_id = v_appointment.employee_id and tstzrange(eto.starts_at, eto.ends_at, '[)') && tstzrange(p_new_starts_at, v_new_ends_at, '[)')
  ) then raise exception 'appointment_conflict'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_appointment.employee_id::text || v_local_start::date::text, 0));

  update public.appointments
  set starts_at = p_new_starts_at, ends_at = v_new_ends_at
  where id = v_appointment.id;

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body, data)
  values (auth.uid(), v_appointment.business_id, v_appointment.id, 'appointment_rescheduled', 'Randevu saatiniz değiştirildi',
    to_char(v_local_start, 'DD.MM.YYYY HH24:MI'), jsonb_build_object('starts_at', p_new_starts_at));

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body, data)
  select bm.user_id, v_appointment.business_id, v_appointment.id, 'appointment_rescheduled_by_customer', 'Müşteri randevu saatini değiştirdi',
    to_char(v_local_start, 'DD.MM.YYYY HH24:MI'), jsonb_build_object('starts_at', p_new_starts_at)
  from public.business_members bm
  where bm.business_id = v_appointment.business_id and bm.active and bm.role in ('OWNER', 'MANAGER') and bm.user_id <> auth.uid();

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (v_appointment.business_id, auth.uid(), 'appointment.customer_rescheduled', 'appointment', v_appointment.id::text,
    jsonb_build_object('starts_at', v_appointment.starts_at, 'ends_at', v_appointment.ends_at),
    jsonb_build_object('starts_at', p_new_starts_at, 'ends_at', v_new_ends_at));

  return jsonb_build_object('id', v_appointment.id, 'status', v_appointment.status, 'starts_at', p_new_starts_at, 'ends_at', v_new_ends_at);
exception when exclusion_violation then
  raise exception 'appointment_conflict' using errcode = '23P01';
end;
$$;

revoke all on function public.get_customer_appointments() from public;
revoke all on function public.get_appointment_reschedule_slots(uuid, date) from public;
revoke all on function public.cancel_customer_appointment(uuid, text) from public;
revoke all on function public.reschedule_customer_appointment(uuid, timestamptz) from public;

grant execute on function public.get_customer_appointments() to authenticated;
grant execute on function public.get_appointment_reschedule_slots(uuid, date) to authenticated;
grant execute on function public.cancel_customer_appointment(uuid, text) to authenticated;
grant execute on function public.reschedule_customer_appointment(uuid, timestamptz) to authenticated;
