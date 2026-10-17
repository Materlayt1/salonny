-- Phase 1: additive, read-only compatibility layer. Deploy its web/native API
-- consumers before applying 041. No customer/appointment/stock rows are written.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $$ begin
  if to_regprocedure('public.native_business_report(uuid,uuid,integer,boolean,text,integer)') is null
    or to_regprocedure('public.customer_care_context(uuid,boolean)') is null
    or to_regclass('public.customer_booking_requests') is null then
    raise exception 'PANEL_ACCESS_PREREQUISITES_REQUIRED';
  end if;
end $$;

create index if not exists employees_active_user_scope_idx on public.employees(business_id,user_id) where active and user_id is not null;
create index if not exists appointments_panel_branch_order_idx on public.appointments(business_id,branch_id,starts_at desc,id);
create index if not exists appointments_panel_employee_order_idx on public.appointments(business_id,employee_id,branch_id,starts_at desc,id);

-- These are deliberately owner-rights views with an explicit actor predicate,
-- not invoker views that would lose staff access after 041. Their entire
-- projection is safe to SELECT *, filter, order or aggregate. No customer ID,
-- user ID, private notes, booking key or unredacted denied money is exposed.
create view public.business_calendar_appointments with(security_barrier=true) as
select a.id,a.business_id,a.branch_id,a.employee_id,a.starts_at,a.ends_at,a.status,
  case when bm.role in('OWNER','MANAGER') or coalesce(mp.customer_visibility,'assigned') in('all','assigned') then c.full_name end customer_name,
  case when bm.role in('OWNER','MANAGER') or coalesce(mp.customer_visibility,'assigned') in('all','assigned') then c.phone end customer_phone,
  e.display_name employee_name,
  coalesce(items.names,'{}'::text[]) service_names,
  coalesce(items.label,'') service_label,
  case when bm.role in('OWNER','MANAGER') or mp.financial_visibility is true then a.total_minor end total_minor,
  case when bm.role in('OWNER','MANAGER') or mp.financial_visibility is true then a.currency end currency
from public.appointments a
join public.business_members bm on bm.business_id=a.business_id and bm.user_id=(select auth.uid()) and bm.active
join public.branches b on b.id=a.branch_id and b.business_id=a.business_id and b.active
left join public.business_member_permissions mp on mp.business_id=bm.business_id and mp.user_id=bm.user_id
left join public.customers c on c.id=a.customer_id and c.business_id=a.business_id
left join public.employees e on e.id=a.employee_id and e.business_id=a.business_id
left join lateral (
  select min(own.id::text)::uuid id,count(*) matches from public.employees own
  where own.business_id=a.business_id and own.user_id=bm.user_id and own.active
) own on bm.role='EMPLOYEE'
left join lateral (
  select array_agg(i.name_snapshot order by i.sort_order,i.id) names,
    string_agg(i.name_snapshot,' · ' order by i.sort_order,i.id) label
  from public.appointment_items i where i.appointment_id=a.id and i.business_id=a.business_id
) items on true
where bm.role in('OWNER','MANAGER') or (bm.role='EMPLOYEE'
  and coalesce(mp.permissions->'calendar','true'::jsonb)='true'::jsonb
  and own.matches=1 and a.employee_id=own.id);

create view public.business_inventory_access with(security_barrier=true) as
select p.id,p.business_id,p.branch_id,p.name,p.sku,p.stock_quantity,p.minimum_stock,p.active,p.created_at,
  case when bm.role in('OWNER','MANAGER') or mp.financial_visibility is true then p.purchase_price_minor end purchase_price_minor,
  case when bm.role in('OWNER','MANAGER') or mp.financial_visibility is true then p.sale_price_minor end sale_price_minor
from public.inventory_products p
join public.business_members bm on bm.business_id=p.business_id and bm.user_id=(select auth.uid()) and bm.active
left join public.business_member_permissions mp on mp.business_id=bm.business_id and mp.user_id=bm.user_id
where bm.role in('OWNER','MANAGER') or (bm.role='EMPLOYEE' and mp.permissions->'inventory'='true'::jsonb);

-- A legitimate empty business returns one row with total=0. No row means the
-- actor is not allowed to see this aggregate, not a successful empty result.
create view public.business_customer_totals with(security_barrier=true) as
select bm.business_id,count(c.id)::bigint total
from public.business_members bm
left join public.business_member_permissions mp on mp.business_id=bm.business_id and mp.user_id=bm.user_id
left join public.customers c on c.business_id=bm.business_id
where bm.user_id=(select auth.uid()) and bm.active and (bm.role in('OWNER','MANAGER') or
  (bm.role='EMPLOYEE' and coalesce(mp.permissions->'customers','true'::jsonb)='true'::jsonb and mp.customer_visibility='all'
    and (select count(*)=1 from public.employees own where own.business_id=bm.business_id and own.user_id=bm.user_id and own.active)))
group by bm.business_id;

revoke all on public.business_calendar_appointments,public.business_inventory_access,public.business_customer_totals from public,anon,authenticated;
grant select on public.business_calendar_appointments,public.business_inventory_access,public.business_customer_totals to authenticated;

-- An explicit selected business replaces the legacy "first membership" import.
-- This entry point is additive so it is available before the app deployment.
create function public.import_business_customers(p_business_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job uuid; v_total integer; v_imported integer;
begin
  if auth.uid() is null or not exists(select 1 from public.business_members m where m.business_id=p_business_id
    and m.user_id=auth.uid() and m.active and m.role in('OWNER','MANAGER')) then raise exception 'business_manager_required' using errcode='42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'invalid_import' using errcode='22023'; end if;
  v_total:=jsonb_array_length(p_rows);
  if v_total not between 1 and 5000 or exists(select 1 from jsonb_array_elements(p_rows) r
    where jsonb_typeof(r)<>'object' or jsonb_typeof(r->'fullName') is distinct from 'string' or length(trim(r->>'fullName')) not between 2 and 120
      or jsonb_typeof(r->'phone') is distinct from 'string' or length(trim(r->>'phone')) not between 10 and 24
      or length(coalesce(r->>'email',''))>254 or length(coalesce(r->>'notes',''))>2000
      or (r ? 'marketingConsent' and jsonb_typeof(r->'marketingConsent')<>'boolean'))
    or exists(select 1 from jsonb_array_elements(p_rows) r group by trim(r->>'phone') having count(*)>1)
  then raise exception 'invalid_import' using errcode='22023'; end if;
  insert into public.data_import_jobs(business_id,kind,total_rows,created_by) values(p_business_id,'customers',v_total,auth.uid()) returning id into v_job;
  insert into public.customers(business_id,full_name,phone,email,notes,marketing_consent)
    select p_business_id,trim(r->>'fullName'),trim(r->>'phone'),nullif(trim(r->>'email'),''),nullif(trim(r->>'notes'),''),coalesce((r->>'marketingConsent')::boolean,false)
    from jsonb_array_elements(p_rows) r
    on conflict(business_id,phone) do update set full_name=excluded.full_name,email=excluded.email,notes=excluded.notes,marketing_consent=excluded.marketing_consent,updated_at=now();
  get diagnostics v_imported=row_count;
  update public.data_import_jobs set status='completed',imported_rows=v_imported,rejected_rows=v_total-v_imported,completed_at=now() where id=v_job;
  return jsonb_build_object('jobId',v_job,'total',v_total,'imported',v_imported,'rejected',v_total-v_imported);
end $$;
revoke all on function public.import_business_customers(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_business_customers(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
