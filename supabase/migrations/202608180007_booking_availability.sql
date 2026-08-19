-- Database-backed availability for the customer booking flow.

create or replace function public.get_booking_slots(
  p_business_id uuid,
  p_branch_id uuid,
  p_employee_id uuid,
  p_service_id uuid,
  p_date date
) returns table(starts_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_duration integer;
  v_buffer_after integer;
  v_weekday integer;
  v_booking_window integer;
  v_minimum_notice integer;
  v_local_today date;
  v_has_employee_hours boolean;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;

  select b.timezone,
         coalesce(es.duration_override_minutes, s.duration_minutes),
         s.buffer_after_minutes,
         coalesce(settings.booking_window_days, 60),
         coalesce(settings.minimum_notice_minutes, 120)
  into v_timezone, v_duration, v_buffer_after, v_booking_window, v_minimum_notice
  from public.businesses b
  join public.branches branch on branch.id = p_branch_id and branch.business_id = b.id and branch.active
  join public.services s on s.id = p_service_id and s.business_id = b.id and s.active
  join public.branch_services bs on bs.branch_id = branch.id and bs.service_id = s.id and bs.active
  join public.employees e on e.id = p_employee_id and e.business_id = b.id and e.active
  join public.employee_branches eb on eb.employee_id = e.id and eb.branch_id = branch.id
  join public.employee_services es on es.employee_id = e.id and es.service_id = s.id
  left join public.business_settings settings on settings.business_id = b.id
  where b.id = p_business_id and (b.status = 'published' or public.is_business_member(b.id));

  if not found then raise exception 'booking_configuration_not_found'; end if;
  v_local_today := (now() at time zone v_timezone)::date;
  if p_date < v_local_today or p_date > v_local_today + v_booking_window then return; end if;
  v_weekday := extract(isodow from p_date)::integer - 1;

  select exists(
    select 1 from public.employee_working_hours ewh
    where ewh.employee_id = p_employee_id and ewh.branch_id = p_branch_id and ewh.weekday = v_weekday
      and (ewh.valid_from is null or ewh.valid_from <= p_date)
      and (ewh.valid_until is null or ewh.valid_until >= p_date)
  ) into v_has_employee_hours;

  return query
  with working_periods as (
    select ewh.starts_at, ewh.ends_at
    from public.employee_working_hours ewh
    where v_has_employee_hours and ewh.employee_id = p_employee_id and ewh.branch_id = p_branch_id and ewh.weekday = v_weekday
      and (ewh.valid_from is null or ewh.valid_from <= p_date)
      and (ewh.valid_until is null or ewh.valid_until >= p_date)
    union all
    select bh.opens_at, bh.closes_at
    from public.business_hours bh
    where not v_has_employee_hours and bh.branch_id = p_branch_id and bh.weekday = v_weekday and not bh.is_closed
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
      where bb.branch_id = p_branch_id and bb.weekday = v_weekday
        and tsrange(p_date + bb.starts_at, p_date + bb.ends_at, '[)') && tsrange(p_date + zs.local_start_time, p_date + zs.local_end_time, '[)')
    )
    and not exists (
      select 1 from public.employee_time_off eto
      where eto.employee_id = p_employee_id and tstzrange(eto.starts_at, eto.ends_at, '[)') && tstzrange(zs.slot_start, zs.slot_end, '[)')
    )
    and not exists (
      select 1 from public.appointments appointment
      where appointment.employee_id = p_employee_id and appointment.status in ('pending', 'confirmed')
        and tstzrange(appointment.starts_at, appointment.ends_at, '[)') && tstzrange(zs.slot_start, zs.slot_end, '[)')
    )
  order by zs.slot_start;
end;
$$;

revoke all on function public.get_booking_slots(uuid, uuid, uuid, uuid, date) from public;
grant execute on function public.get_booking_slots(uuid, uuid, uuid, uuid, date) to authenticated;
