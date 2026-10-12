-- Aggregate-only, JWT/tenant checked reports. No appointment/customer writes.
-- Completed appointment value is not revenue, a payment or an item-price sum.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists appointments_business_report_start_idx
  on public.appointments (business_id, starts_at, branch_id, employee_id);
create index if not exists appointment_items_report_booking_service_idx
  on public.appointment_items (appointment_id, service_id);
create index if not exists employee_time_off_report_employee_start_idx
  on public.employee_time_off (employee_id, starts_at, ends_at);

create or replace function public.business_report_range_minutes(p_ranges tstzmultirange)
returns numeric language sql immutable strict set search_path = '' as $$
  select coalesce(sum(extract(epoch from (upper(r) - lower(r))) / 60), 0)
  from unnest(p_ranges) r;
$$;
revoke all on function public.business_report_range_minutes(tstzmultirange) from public, anon, authenticated;

create or replace function public.native_business_report(
  p_business_id uuid,
  p_branch_id uuid,
  p_days integer default 30,
  p_all_branches boolean default false,
  p_dimension text default 'service',
  p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_timezone text;
  v_employee uuid;
  v_employee_count integer;
  v_today date;
  v_from date;
  v_previous date;
  v_start timestamptz;
  v_previous_start timestamptz;
  v_end timestamptz;
  v_plan_from date;
  v_plan_to date;
  v_plan_start timestamptz;
  v_plan_end timestamptz;
  v_utilization jsonb;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if p_business_id is null or p_days is null or p_days not in (7,30,90)
    or p_all_branches is null or p_dimension is null or p_dimension not in ('service','employee','branch')
    or p_offset is null or p_offset < 0 or p_offset > 1000000 or p_offset % 25 <> 0
    or (not p_all_branches and p_branch_id is null) then
    raise exception 'REPORT_INPUT_INVALID' using errcode='22023';
  end if;
  select m.role::text, b.timezone into v_role, v_timezone
  from public.business_members m join public.businesses b on b.id=m.business_id
  where m.business_id=p_business_id and m.user_id=v_actor and m.active;
  if not found or v_role not in ('OWNER','MANAGER','EMPLOYEE') then
    raise exception 'REPORT_ACCESS_DENIED' using errcode='42501';
  end if;
  if v_role='EMPLOYEE' then
    if not exists(select 1 from public.business_member_permissions mp
      where mp.business_id=p_business_id and mp.user_id=v_actor
        and mp.permissions->'reports'='true'::jsonb and mp.financial_visibility) then
      raise exception 'REPORT_ACCESS_DENIED' using errcode='42501';
    end if;
    select count(*), (array_agg(e.id order by e.id))[1] into v_employee_count,v_employee
    from public.employees e where e.business_id=p_business_id and e.user_id=v_actor and e.active;
    if v_employee_count<>1 then raise exception 'REPORT_STAFF_SCOPE_INVALID' using errcode='42501'; end if;
  end if;
  if p_branch_id is not null and not exists(select 1 from public.branches b
    where b.id=p_branch_id and b.business_id=p_business_id and b.active) then
    raise exception 'REPORT_BRANCH_DENIED' using errcode='42501';
  end if;
  if v_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    raise exception 'REPORT_TIMEZONE_INVALID' using errcode='22023';
  end if;
  v_today := (now() at time zone v_timezone)::date;
  v_from := v_today-p_days;
  v_previous := v_from-p_days;
  v_start := v_from::timestamp at time zone v_timezone;
  v_previous_start := v_previous::timestamp at time zone v_timezone;
  v_end := v_today::timestamp at time zone v_timezone;
  v_plan_from := v_today+1;
  v_plan_to := v_today+8;
  v_plan_start := v_plan_from::timestamp at time zone v_timezone;
  v_plan_end := v_plan_to::timestamp at time zone v_timezone;

  -- Corrupt legacy rows must not disappear through joins and fabricate totals.
  if exists(select 1 from public.appointments a
    left join public.branches b on b.id=a.branch_id
    left join public.employees e on e.id=a.employee_id
    where a.business_id=p_business_id
      and (v_employee is null or a.employee_id=v_employee)
      and ((a.starts_at>=v_previous_start and a.starts_at<v_end and (p_all_branches or a.branch_id=p_branch_id))
        or (a.status in ('pending','confirmed') and a.starts_at<v_plan_end and a.ends_at>v_plan_start
          and (p_all_branches or a.branch_id=p_branch_id or exists(select 1 from public.employee_branches eb
            where eb.employee_id=a.employee_id and eb.branch_id=p_branch_id)
            or exists(select 1 from public.appointments scoped where scoped.business_id=p_business_id
              and scoped.employee_id=a.employee_id and scoped.branch_id=p_branch_id
              and scoped.status in ('pending','confirmed') and scoped.starts_at<v_plan_end and scoped.ends_at>v_plan_start))))
      and (b.id is null or b.business_id<>p_business_id or e.id is null or e.business_id<>p_business_id
        or not isfinite(a.starts_at) or not isfinite(a.ends_at) or a.starts_at>=a.ends_at
        or char_length(b.name)=0 or char_length(e.display_name)=0
        or a.total_minor<0 or a.total_minor is null or a.currency is null or btrim(a.currency) !~ '^[A-Z]{3}$'
        or a.status::text not in ('pending','confirmed','completed','cancelled','no_show')))
    or exists(select 1 from public.appointment_items i join public.appointments a on a.id=i.appointment_id
      left join public.services s on s.id=i.service_id
      left join public.employees item_employee on item_employee.id=i.employee_id
      where a.business_id=p_business_id and (p_all_branches or a.branch_id=p_branch_id)
        and (v_employee is null or a.employee_id=v_employee)
        and a.starts_at>=v_previous_start and a.starts_at<v_end
        and (i.business_id<>p_business_id or s.id is null or s.business_id<>p_business_id or char_length(s.name)=0
          or item_employee.id is null or item_employee.business_id<>p_business_id))
    or (select count(distinct a.currency) from public.appointments a
      where a.business_id=p_business_id and (p_all_branches or a.branch_id=p_branch_id)
        and (v_employee is null or a.employee_id=v_employee)
        and a.starts_at>=v_previous_start and a.starts_at<v_end and a.status='completed')>32
    or exists(select 1 from public.appointments a
      where a.business_id=p_business_id and (p_all_branches or a.branch_id=p_branch_id)
        and (v_employee is null or a.employee_id=v_employee)
        and a.starts_at>=v_previous_start and a.starts_at<v_end and a.status='completed'
      group by a.currency having sum(a.total_minor::numeric)>=1e30::numeric) then
    raise exception 'REPORT_DATA_INTEGRITY' using errcode='23514';
  end if;

  -- Current future plan, not a historical occupancy estimate. Apply the same
  -- hours fallback/date rules as get_booking_slots; breaks before branch union.
  if exists(select 1 from public.appointments a join public.employees e on e.id=a.employee_id
    where e.business_id=p_business_id and a.business_id<>p_business_id
      and (v_employee is null or e.id=v_employee) and a.status in ('pending','confirmed')
      and a.starts_at<v_plan_end and a.ends_at>v_plan_start
      and (p_all_branches or exists(select 1 from public.employee_branches eb where eb.employee_id=e.id and eb.branch_id=p_branch_id)
        or exists(select 1 from public.appointments scoped where scoped.business_id=p_business_id
          and scoped.employee_id=e.id and scoped.branch_id=p_branch_id and scoped.status in ('pending','confirmed')
          and scoped.starts_at<v_plan_end and scoped.ends_at>v_plan_start)))
    or exists(select 1 from public.employee_branches eb
    join public.employees e on e.id=eb.employee_id left join public.branches b on b.id=eb.branch_id
    where e.business_id=p_business_id and e.active and (v_employee is null or e.id=v_employee)
      and (p_all_branches or eb.branch_id=p_branch_id) and (b.id is null or b.business_id<>p_business_id))
    or exists(select 1 from public.employee_working_hours h
      join public.employees e on e.id=h.employee_id join public.branches b on b.id=h.branch_id
      where e.business_id=p_business_id and e.active and b.active
        and (v_employee is null or e.id=v_employee) and (p_all_branches or b.id=p_branch_id)
        and (h.business_id<>p_business_id or b.business_id<>p_business_id
          or h.weekday not between 0 and 6 or h.starts_at>=h.ends_at
          or (h.valid_from is not null and not isfinite(h.valid_from))
          or (h.valid_until is not null and not isfinite(h.valid_until))
          or (h.valid_from is not null and h.valid_until is not null and h.valid_from>h.valid_until)
          or not exists(select 1 from public.employee_branches eb where eb.employee_id=e.id and eb.branch_id=b.id)))
    or exists(select 1 from public.business_hours h join public.branches b on b.id=h.branch_id
      where b.business_id=p_business_id and b.active and (p_all_branches or b.id=p_branch_id)
        and (h.business_id<>p_business_id or h.weekday not between 0 and 6
          or (not h.is_closed and (h.opens_at is null or h.closes_at is null or h.opens_at>=h.closes_at))
          or (h.valid_from is not null and not isfinite(h.valid_from))
          or (h.valid_until is not null and not isfinite(h.valid_until))
          or (h.valid_from is not null and h.valid_until is not null and h.valid_from>h.valid_until)))
    or exists(select 1 from public.business_breaks h join public.branches b on b.id=h.branch_id
      where b.business_id=p_business_id and b.active and (p_all_branches or b.id=p_branch_id)
        and (h.business_id<>p_business_id or h.weekday not between 0 and 6 or h.starts_at>=h.ends_at))
    or exists(select 1 from public.employee_time_off t join public.employees e on e.id=t.employee_id
      where e.business_id=p_business_id and e.active and (v_employee is null or e.id=v_employee)
        and t.starts_at<v_plan_end and t.ends_at>v_plan_start
        and (t.business_id<>p_business_id or not isfinite(t.starts_at) or not isfinite(t.ends_at) or t.starts_at>=t.ends_at)) then
    raise exception 'REPORT_PLAN_INTEGRITY' using errcode='23514';
  end if;

  with staff as materialized(
    select distinct e.id from public.employees e join public.employee_branches eb on eb.employee_id=e.id
      join public.branches b on b.id=eb.branch_id and b.business_id=p_business_id and b.active
    where e.business_id=p_business_id and e.active and (v_employee is null or e.id=v_employee)
      and (p_all_branches or b.id=p_branch_id)
    union
    -- Existing future bookings on inactive/unassigned staff remain visible as
    -- outside-capacity minutes, rather than silently disappearing.
    select distinct a.employee_id from public.appointments a
    where a.business_id=p_business_id and (p_all_branches or a.branch_id=p_branch_id)
      and (v_employee is null or a.employee_id=v_employee) and a.status in ('pending','confirmed')
      and a.starts_at<v_plan_end and a.ends_at>v_plan_start
  ), plans as(
    select e.id employee_id,b.id branch_id,d::date as day,
      extract(isodow from d)::integer-1 weekday,
      exists(select 1 from public.employee_working_hours h where h.employee_id=e.id and h.branch_id=b.id
        and h.weekday=extract(isodow from d)::integer-1
        and (h.valid_from is null or h.valid_from<=d::date) and (h.valid_until is null or h.valid_until>=d::date)) employee_hours
    from staff e join public.employees employee on employee.id=e.id and employee.business_id=p_business_id and employee.active
      join public.employee_branches eb on eb.employee_id=e.id
      join public.branches b on b.id=eb.branch_id and b.business_id=p_business_id and b.active
    cross join generate_series(v_plan_from::timestamp,(v_plan_to-1)::timestamp,interval '1 day') d
    where p_all_branches or b.id=p_branch_id
  ), raw_periods as(
    select p.employee_id,p.branch_id,p.day,p.weekday,h.starts_at,h.ends_at
    from plans p join public.employee_working_hours h on p.employee_hours and h.employee_id=p.employee_id
      and h.branch_id=p.branch_id and h.weekday=p.weekday
      and (h.valid_from is null or h.valid_from<=p.day) and (h.valid_until is null or h.valid_until>=p.day)
    union all
    select p.employee_id,p.branch_id,p.day,p.weekday,h.opens_at,h.closes_at
    from plans p join public.business_hours h on not p.employee_hours and h.branch_id=p.branch_id
      and h.weekday=p.weekday and not h.is_closed
      and (h.valid_from is null or h.valid_from<=p.day) and (h.valid_until is null or h.valid_until>=p.day)
  ), branch_capacity as(
    select r.employee_id,
      tstzmultirange(tstzrange((r.day+r.starts_at) at time zone v_timezone,
        (r.day+r.ends_at) at time zone v_timezone,'[)'))
      - coalesce((select range_agg(tstzrange((r.day+b.starts_at) at time zone v_timezone,
          (r.day+b.ends_at) at time zone v_timezone,'[)'))
        from public.business_breaks b where b.branch_id=r.branch_id and b.weekday=r.weekday),'{}'::tstzmultirange) capacity
    from raw_periods r
  ), union_capacity as(
    select s.id,coalesce((select range_agg(piece) from branch_capacity b cross join lateral unnest(b.capacity) piece
      where b.employee_id=s.id),'{}'::tstzmultirange) capacity from staff s
  ), available as(
    select c.id,c.capacity-coalesce((select range_agg(tstzrange(t.starts_at,t.ends_at,'[)'))
      from public.employee_time_off t where t.employee_id=c.id and t.starts_at<v_plan_end and t.ends_at>v_plan_start),
      '{}'::tstzmultirange) capacity from union_capacity c
  ), busy as(
    select c.id,c.capacity,coalesce((select range_agg(tstzrange(greatest(a.starts_at,v_plan_start),least(a.ends_at,v_plan_end),'[)'))
      from public.appointments a where a.employee_id=c.id and a.business_id=p_business_id
        and a.status in ('pending','confirmed')
        and a.starts_at<v_plan_end and a.ends_at>v_plan_start),'{}'::tstzmultirange) busy
      ,coalesce((select range_agg(tstzrange(greatest(a.starts_at,v_plan_start),least(a.ends_at,v_plan_end),'[)'))
      from public.appointments a where a.employee_id=c.id and a.business_id=p_business_id
        and (p_all_branches or a.branch_id=p_branch_id) and a.status in ('pending','confirmed')
        and a.starts_at<v_plan_end and a.ends_at>v_plan_start),'{}'::tstzmultirange) scope_busy
    from available c
  ), totals as(
    select coalesce(sum(public.business_report_range_minutes(capacity)),0) available,
      coalesce(sum(public.business_report_range_minutes(capacity*busy)),0) busy,
      coalesce(sum(public.business_report_range_minutes(scope_busy-capacity)),0) outside from busy
  ) select jsonb_build_object('from',v_plan_from,'toExclusive',v_plan_to,'days',7,
    'availableMinutes',available,'busyMinutes',busy,'outsideCapacityMinutes',outside,
    'ratio',case when available>0 then busy/available else null end,'basis','current_plan','historical',false)
  into v_utilization from totals;

  with records as materialized(
    select a.id,a.branch_id,a.employee_id,a.status::text status,a.total_minor,btrim(a.currency) currency,
      (a.starts_at at time zone v_timezone)::date as day,
      case when a.starts_at>=v_start then 'current' else 'previous' end period,
      case when a.status in ('pending','confirmed','completed') then extract(epoch from(a.ends_at-a.starts_at))/60 else 0 end minutes
    from public.appointments a where a.business_id=p_business_id
      and (p_all_branches or a.branch_id=p_branch_id) and (v_employee is null or a.employee_id=v_employee)
      and a.starts_at>=v_previous_start and a.starts_at<v_end
  ), summary_counts as(
    select periods.period,count(r.id) total,count(r.id) filter(where r.status='completed') completed,
      count(r.id) filter(where r.status='cancelled') cancelled,count(r.id) filter(where r.status='no_show') no_show,
      coalesce(sum(r.minutes),0) minutes
    from (values('current'),('previous')) periods(period) left join records r on r.period=periods.period group by periods.period
  ), summary_values as(
    select period,currency,sum(total_minor::numeric)::text minor from records where status='completed' group by period,currency
  ), summaries as(
    select c.period,jsonb_build_object('total',c.total,'completed',c.completed,'cancelled',c.cancelled,'noShow',c.no_show,
      'bookedMinutes',c.minutes,'values',coalesce((select jsonb_agg(jsonb_build_object('currency',v.currency,'minor',v.minor) order by v.currency)
        from summary_values v where v.period=c.period),'[]'::jsonb)) value from summary_counts c
  ), days as(
    select d::date as day from generate_series(v_from::timestamp,(v_today-1)::timestamp,interval '1 day') d
  ), daily_counts as(
    select d.day,count(r.id) total,count(r.id) filter(where r.status='completed') completed,
      count(r.id) filter(where r.status='cancelled') cancelled,count(r.id) filter(where r.status='no_show') no_show,
      coalesce(sum(r.minutes),0) minutes from days d left join records r on r.day=d.day and r.period='current' group by d.day
  ), daily_values as(
    select day,currency,sum(total_minor::numeric)::text minor from records where period='current' and status='completed' group by day,currency
  ), participation as materialized(
    select distinct r.id,r.status,r.minutes,r.total_minor,r.currency,
      case p_dimension when 'service' then i.service_id when 'employee' then r.employee_id else r.branch_id end group_id
    from records r left join public.appointment_items i on p_dimension='service' and i.appointment_id=r.id
    where r.period='current' and (p_dimension<>'service' or i.service_id is not null)
  ), breakdown_counts as(
    select p.group_id,count(*) total,count(*) filter(where status='completed') completed,
      count(*) filter(where status='cancelled') cancelled,count(*) filter(where status='no_show') no_show,coalesce(sum(minutes),0) minutes
    from participation p group by p.group_id
  ), breakdown_values as(
    select group_id,currency,sum(total_minor::numeric)::text minor from participation
    where p_dimension<>'service' and status='completed' group by group_id,currency
  ), labeled as(
    select c.*,left(case p_dimension when 'service' then s.name when 'employee' then e.display_name else b.name end,160) label
    from breakdown_counts c left join public.services s on p_dimension='service' and s.id=c.group_id
      left join public.employees e on p_dimension='employee' and e.id=c.group_id
      left join public.branches b on p_dimension='branch' and b.id=c.group_id
  ), page as(
    select * from labeled order by total desc,group_id offset p_offset limit 25
  ) select jsonb_build_object(
    'generatedAt',now(),
    'period',jsonb_build_object('from',v_from,'toExclusive',v_today,'previousFrom',v_previous,'days',p_days,'timezone',v_timezone),
    'scope',jsonb_build_object('businessId',p_business_id,'branchId',case when p_all_branches then null else p_branch_id end,
      'allBranches',p_all_branches,'employeeId',v_employee),
    'summary',(select jsonb_object_agg(period,value) from summaries),
    'daily',(select jsonb_agg(jsonb_build_object('date',c.day,'total',c.total,'completed',c.completed,'cancelled',c.cancelled,'noShow',c.no_show,
      'bookedMinutes',c.minutes,'values',coalesce((select jsonb_agg(jsonb_build_object('currency',v.currency,'minor',v.minor) order by v.currency)
        from daily_values v where v.day=c.day),'[]'::jsonb)) order by c.day) from daily_counts c),
    'breakdown',jsonb_build_object('dimension',p_dimension,'offset',p_offset,'total',(select count(*) from labeled),
      'hasMore',p_offset+25<(select count(*) from labeled),
      'rows',coalesce((select jsonb_agg(jsonb_build_object('id',c.group_id,'label',c.label,'total',c.total,'completed',c.completed,
        'cancelled',c.cancelled,'noShow',c.no_show,'bookedMinutes',c.minutes,
        'values',case when p_dimension='service' then null else coalesce((select jsonb_agg(jsonb_build_object('currency',v.currency,'minor',v.minor) order by v.currency)
          from breakdown_values v where v.group_id=c.group_id),'[]'::jsonb) end) order by c.total desc,c.group_id) from page c),'[]'::jsonb)),
    'utilization',v_utilization
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.native_business_report(uuid,uuid,integer,boolean,text,integer) from public, anon;
grant execute on function public.native_business_report(uuid,uuid,integer,boolean,text,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
