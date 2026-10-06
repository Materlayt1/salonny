-- Public-only, invoker-rights search. Existing SELECT RLS remains authoritative.
-- Global ordering happens before pagination, never just on the first client page.
create index if not exists services_active_name_trgm_idx
  on public.services using gin (name extensions.gin_trgm_ops) where active;

create or replace function public.marketplace_search_page(
  p_offset integer default 0, p_limit integer default 12,
  p_query text default null, p_category text default null, p_city text default null,
  p_open_now boolean default false, p_sort text default 'recommended',
  p_latitude double precision default null, p_longitude double precision default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with candidates as (
    select b.id, b.name, b.created_at, b.rating_average, b.review_count,
      price.minimum_price,
      case when p_latitude between -90 and 90 and p_longitude between -180 and 180
        then 6371.0088 * acos(least(1.0, greatest(-1.0,
          sin(radians(p_latitude)) * sin(radians(loc.latitude::double precision)) +
          cos(radians(p_latitude)) * cos(radians(loc.latitude::double precision)) *
          cos(radians(loc.longitude::double precision - p_longitude)))))
        else null end as distance_km
    from public.businesses b
    join public.business_categories category on category.id = b.category_id
    join lateral (
      select br.id from public.branches br where br.business_id = b.id and br.active
      order by br.is_primary desc, br.created_at, br.id limit 1
    ) branch on true
    join lateral (
      select l.city, l.latitude, l.longitude from public.business_locations l where l.business_id = b.id
      order by (l.branch_id = branch.id) desc nulls last, l.created_at, l.id limit 1
    ) loc on true
    left join lateral (
      select min(s.price_minor) as minimum_price from public.services s where s.business_id = b.id and s.active
    ) price on true
    where b.status = 'published'
      and loc.latitude between -90 and 90 and loc.longitude between -180 and 180
      and not (loc.latitude = 0 and loc.longitude = 0)
      and (nullif(trim(p_category), '') is null or category.slug = left(trim(p_category), 80))
      and (nullif(trim(p_city), '') is null or loc.city ilike left(trim(p_city), 80))
      and (nullif(trim(p_query), '') is null or b.name ilike '%' || left(trim(p_query), 80) || '%'
        or exists (select 1 from public.services s where s.business_id = b.id and s.active and s.name ilike '%' || left(trim(p_query), 80) || '%'))
      and (not coalesce(p_open_now, false) or exists (
        select 1 from public.business_hours h where h.branch_id = branch.id and not h.is_closed
          and h.weekday = (extract(isodow from current_timestamp at time zone coalesce(b.timezone, 'Europe/Istanbul'))::integer - 1)
          and h.opens_at <= (current_timestamp at time zone coalesce(b.timezone, 'Europe/Istanbul'))::time
          and h.closes_at > (current_timestamp at time zone coalesce(b.timezone, 'Europe/Istanbul'))::time
      ))
  ), page as (
    select * from candidates order by
      case when p_sort = 'nearest' then distance_km end asc nulls last,
      case when p_sort = 'price' then minimum_price end asc nulls last,
      case when p_sort = 'newest' then created_at end desc nulls last,
      case when p_sort = 'name' then name end asc nulls last,
      rating_average desc, review_count desc, id
    limit least(100, greatest(1, coalesce(p_limit, 12)))
    offset least(100000, greatest(0, coalesce(p_offset, 0)))
  ) select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id) from page), '[]'::jsonb),
    'total', (select count(*) from candidates),
    'distances', coalesce((select jsonb_object_agg(id::text, distance_km) from page where distance_km is not null), '{}'::jsonb)
  );
$$;
revoke all on function public.marketplace_search_page(integer,integer,text,text,text,boolean,text,double precision,double precision) from public;
grant execute on function public.marketplace_search_page(integer,integer,text,text,text,boolean,text,double precision,double precision) to anon, authenticated;
