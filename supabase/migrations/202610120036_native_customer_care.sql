-- Private customer care, scoped native history and future-only loyalty changes.
-- Does not modify existing customer/profile/appointment/point balances or send messages.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $$ begin
  if not exists(select 1 from storage.buckets b where b.id='customer-care-assets' and not b.public) then raise exception 'CUSTOMER_CARE_PRIVATE_BUCKET_REQUIRED'; end if;
  if exists(select 1 from public.customer_care_profiles p join public.customers c on c.id=p.customer_id where c.business_id<>p.business_id)
    or exists(select 1 from public.customer_care_media m join public.customers c on c.id=m.customer_id where c.business_id<>m.business_id)
    or exists(select 1 from public.loyalty_accounts l join public.customers c on c.id=l.customer_id where c.business_id<>l.business_id)
    or exists(select 1 from public.customer_care_media m where m.storage_path not like m.business_id::text||'/'||m.customer_id::text||'/%'
      or split_part(m.storage_path,'/',3) !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' or length(split_part(m.storage_path,'/',3))>401 or m.storage_path like '%..%' or array_length(string_to_array(m.storage_path,'/'),1)<>3)
    or exists(select 1 from public.customer_care_media m join public.appointments a on a.id=m.appointment_id where a.business_id<>m.business_id or a.customer_id<>m.customer_id)
  then raise exception 'CUSTOMER_CARE_INTEGRITY'; end if;
end $$;

create table if not exists public.loyalty_point_movements (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null check(kind in ('account_opened','observed_baseline','balance_change')),
  delta integer not null, balance_before integer not null check(balance_before>=0), balance_after integer not null check(balance_after>=0),
  occurred_at timestamptz not null default clock_timestamp(),
  check(balance_before::bigint+delta::bigint=balance_after::bigint)
);
alter table public.loyalty_point_movements enable row level security;
create unique index if not exists customers_business_id_id_care_key on public.customers(business_id,id);
do $$ declare v_table text; begin
  foreach v_table in array array['customer_care_profiles','customer_care_media','loyalty_accounts','loyalty_point_movements'] loop
    execute format('alter table public.%I add constraint %I foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade',v_table,v_table||'_care_tenant_customer_fk');
    execute format('alter table public.%I drop constraint if exists %I',v_table,v_table||'_customer_id_fkey');
  end loop;
end $$;
create index if not exists loyalty_movements_customer_order_idx on public.loyalty_point_movements(business_id,customer_id,occurred_at desc,id desc);
create index if not exists customer_care_appointment_history_idx on public.appointments(business_id,customer_id,branch_id,starts_at desc,id desc);
create index if not exists customer_care_assigned_directory_idx on public.appointments(business_id,employee_id,customer_id);
create index if not exists customer_care_directory_order_idx on public.customers(business_id,created_at desc,id desc);
create unique index if not exists customer_care_media_storage_path_key on public.customer_care_media(storage_path);
alter table public.customer_care_media add constraint customer_care_media_path_scope_check check(
  storage_path like business_id::text||'/'||customer_id::text||'/%' and storage_path not like '%..%'
  and array_length(string_to_array(storage_path,'/'),1)=3 and length(split_part(storage_path,'/',3))<=401 and split_part(storage_path,'/',3) ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$');
create index if not exists customer_care_delivery_payload_idx on public.communication_jobs using gin(payload jsonb_path_ops);

create or replace function public.customer_care_context(p_business_id uuid,p_write boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role public.business_member_role; v_permissions jsonb; v_visibility text; v_financial boolean; v_employee uuid; v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select m.role,p.permissions,p.customer_visibility,p.financial_visibility into v_role,v_permissions,v_visibility,v_financial
    from public.business_members m left join public.business_member_permissions p on p.business_id=m.business_id and p.user_id=m.user_id
    where m.business_id=p_business_id and m.user_id=auth.uid() and m.active;
  if v_role is null or v_role::text not in ('OWNER','MANAGER','EMPLOYEE') then raise exception 'CUSTOMER_CARE_ACCESS_DENIED' using errcode='42501'; end if;
  if v_role::text in ('OWNER','MANAGER') then return jsonb_build_object('employeeId',null,'financialVisible',true,'canWrite',true,'visibility','all'); end if;
  if p_write or coalesce(v_permissions->'customers','true'::jsonb)<>'true'::jsonb or coalesce(v_visibility,'assigned')='none'
    then raise exception 'CUSTOMER_CARE_ACCESS_DENIED' using errcode='42501'; end if;
  select count(*),min(e.id::text)::uuid into v_count,v_employee from public.employees e where e.business_id=p_business_id and e.user_id=auth.uid() and e.active;
  if v_count<>1 then raise exception 'CUSTOMER_CARE_ACCESS_DENIED' using errcode='42501'; end if;
  return jsonb_build_object('employeeId',v_employee,'financialVisible',coalesce(v_financial,false),'canWrite',false,'visibility',coalesce(v_visibility,'assigned'));
end $$;

create or replace function public.assert_customer_care_access(p_business_id uuid,p_customer_id uuid,p_write boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb;
begin
  v_context:=public.customer_care_context(p_business_id,p_write);
  if not exists(select 1 from public.customers c where c.id=p_customer_id and c.business_id=p_business_id) then raise exception 'CUSTOMER_CARE_NOT_FOUND' using errcode='P0002'; end if;
  if v_context->>'visibility'='assigned' and not exists(select 1 from public.appointments a where a.business_id=p_business_id and a.customer_id=p_customer_id and a.employee_id=(v_context->>'employeeId')::uuid)
    then raise exception 'CUSTOMER_CARE_ACCESS_DENIED' using errcode='42501'; end if;
  return v_context-'visibility';
end $$;

create or replace function public.can_access_customer_care(p_business_id uuid,p_customer_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin perform public.assert_customer_care_access(p_business_id,p_customer_id,false); return true;
exception when sqlstate '42501' or sqlstate 'P0002' then return false;
end $$;

create or replace function public.customer_care_path_access(p_path text,p_write boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_business uuid; v_customer uuid;
begin
  if p_path is null or length(p_path)>600 or p_path like '%..%' or array_length(string_to_array(p_path,'/'),1)<>3
    or split_part(p_path,'/',1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or split_part(p_path,'/',2) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or length(split_part(p_path,'/',3))>401 or split_part(p_path,'/',3) !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then return false; end if;
  v_business:=split_part(p_path,'/',1)::uuid; v_customer:=split_part(p_path,'/',2)::uuid;
  perform public.assert_customer_care_access(v_business,v_customer,p_write); return true;
exception when sqlstate '42501' or sqlstate 'P0002' then return false;
end $$;

-- Remove the legacy broad all-member write/read policies. Untrusted clients can
-- never modify care rows or loyalty balances, even through old cached clients.
drop policy if exists care_profiles_tenant on public.customer_care_profiles;
drop policy if exists care_media_tenant on public.customer_care_media;
drop policy if exists loyalty_tenant on public.loyalty_accounts;
create policy care_profiles_scoped_read on public.customer_care_profiles for select to authenticated using(public.can_access_customer_care(business_id,customer_id));
create policy care_media_scoped_read on public.customer_care_media for select to authenticated using(public.can_access_customer_care(business_id,customer_id));
create policy loyalty_scoped_read on public.loyalty_accounts for select to authenticated using(
  public.can_access_customer_care(business_id,customer_id) and (
    public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[])
    or exists(select 1 from public.business_member_permissions p where p.business_id=loyalty_accounts.business_id and p.user_id=auth.uid() and p.financial_visibility)
  ));
create policy loyalty_movements_scoped_read on public.loyalty_point_movements for select to authenticated using(
  public.can_access_customer_care(business_id,customer_id) and (
    public.has_business_role(business_id,array['OWNER','MANAGER']::public.business_member_role[])
    or exists(select 1 from public.business_member_permissions p where p.business_id=loyalty_point_movements.business_id and p.user_id=auth.uid() and p.financial_visibility)
  ));
revoke insert,update,delete,truncate,references,trigger on public.customer_care_profiles,public.customer_care_media,public.loyalty_accounts,public.loyalty_point_movements from public,anon,authenticated;
revoke all on public.customer_care_profiles,public.customer_care_media,public.loyalty_accounts,public.loyalty_point_movements from public,anon;
-- Table revocations alone do not revoke a pre-existing column privilege.
do $$ declare r record; begin
  for r in select c.relname,a.attname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace join pg_catalog.pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relname in ('customer_care_profiles','customer_care_media','loyalty_accounts','loyalty_point_movements') and a.attnum>0 and not a.attisdropped loop
    execute format('revoke insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',r.attname,r.attname,r.attname,r.relname);
  end loop;
end $$;
grant select on public.customer_care_profiles,public.customer_care_media,public.loyalty_accounts,public.loyalty_point_movements to authenticated;

drop policy if exists customer_care_assets_member_read on storage.objects;
drop policy if exists customer_care_assets_member_insert on storage.objects;
drop policy if exists customer_care_assets_member_delete on storage.objects;
create policy customer_care_assets_scoped_read on storage.objects for select to authenticated
  using(bucket_id='customer-care-assets' and public.customer_care_path_access(name,false));
create policy customer_care_assets_manager_insert on storage.objects for insert to authenticated
  with check(bucket_id='customer-care-assets' and public.customer_care_path_access(name,true));
create policy customer_care_assets_manager_delete on storage.objects for delete to authenticated
  using(bucket_id='customer-care-assets' and public.customer_care_path_access(name,true));

create or replace function public.record_customer_loyalty_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.business_id=new.business_id) then raise exception 'CUSTOMER_CARE_INTEGRITY'; end if;
  if tg_op='UPDATE' and (new.business_id<>old.business_id or new.customer_id<>old.customer_id) then raise exception 'CUSTOMER_CARE_INTEGRITY'; end if;
  if tg_op='INSERT' then
    insert into public.loyalty_point_movements(business_id,customer_id,kind,delta,balance_before,balance_after)
      values(new.business_id,new.customer_id,'account_opened',new.points,0,new.points);
  elsif new.points is distinct from old.points then
    if not exists(select 1 from public.loyalty_point_movements l where l.business_id=old.business_id and l.customer_id=old.customer_id) then
      insert into public.loyalty_point_movements(business_id,customer_id,kind,delta,balance_before,balance_after)
        values(old.business_id,old.customer_id,'observed_baseline',0,old.points,old.points);
    end if;
    insert into public.loyalty_point_movements(business_id,customer_id,kind,delta,balance_before,balance_after)
      values(new.business_id,new.customer_id,'balance_change',new.points-old.points,old.points,new.points);
  end if;
  return new;
end $$;
drop trigger if exists customer_loyalty_movement_record on public.loyalty_accounts;
create trigger customer_loyalty_movement_record after insert or update on public.loyalty_accounts for each row execute function public.record_customer_loyalty_change();

create or replace function public.save_customer_care_atomic(
  p_business_id uuid,p_customer_id uuid,p_expected_version timestamptz,p_allergies text[],p_anamnesis text,p_treatment_notes text,p_consent_status text,p_consent_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_profile public.customer_care_profiles%rowtype; v_version timestamptz:=clock_timestamp(); v_consent_at timestamptz;
begin
  perform public.assert_customer_care_access(p_business_id,p_customer_id,true);
  if p_consent_status is null or p_consent_status not in ('missing','requested','signed','revoked') or p_allergies is null or cardinality(p_allergies)>50
    or exists(select 1 from unnest(p_allergies) a where a is null or length(btrim(a)) not between 1 and 120)
    or length(coalesce(p_anamnesis,''))>5000 or length(coalesce(p_treatment_notes,''))>5000 or length(coalesce(p_consent_version,''))>80
    or (p_expected_version is not null and not isfinite(p_expected_version)) then raise exception 'CUSTOMER_CARE_INPUT_INVALID' using errcode='22023'; end if;
  -- Serializes creation and updates as well as checking the expected version.
  perform 1 from public.customers c where c.id=p_customer_id and c.business_id=p_business_id for update;
  select * into v_profile from public.customer_care_profiles p where p.customer_id=p_customer_id;
  -- Safe replay of an ambiguously timed-out identical save does not create a
  -- second revision or overwrite a different concurrent edit.
  if v_profile.business_id=p_business_id and v_profile.allergies=p_allergies
    and v_profile.anamnesis is not distinct from nullif(btrim(p_anamnesis),'')
    and v_profile.treatment_notes is not distinct from nullif(btrim(p_treatment_notes),'')
    and v_profile.consent_status=p_consent_status and v_profile.consent_version is not distinct from nullif(btrim(p_consent_version),'')
    then return jsonb_build_object('saved',true,'customerId',p_customer_id,'updatedAt',v_profile.updated_at); end if;
  if (v_profile.customer_id is not null and (v_profile.business_id<>p_business_id or p_expected_version is distinct from v_profile.updated_at))
    or (v_profile.customer_id is null and p_expected_version is not null) then raise exception 'CUSTOMER_CARE_STALE' using errcode='40001'; end if;
  if v_profile.updated_at is not null then v_version:=greatest(v_version,v_profile.updated_at+interval '1 microsecond'); end if;
  v_consent_at:=case when p_consent_status='signed' then case when v_profile.consent_status='signed' and v_profile.consent_version is not distinct from nullif(btrim(p_consent_version),'') then v_profile.consent_at else v_version end else null end;
  insert into public.customer_care_profiles(customer_id,business_id,allergies,anamnesis,treatment_notes,consent_status,consent_at,consent_version,updated_by,updated_at)
    values(p_customer_id,p_business_id,p_allergies,nullif(btrim(p_anamnesis),''),nullif(btrim(p_treatment_notes),''),p_consent_status,v_consent_at,nullif(btrim(p_consent_version),''),auth.uid(),v_version)
    on conflict(customer_id) do update set allergies=excluded.allergies,anamnesis=excluded.anamnesis,treatment_notes=excluded.treatment_notes,
      consent_status=excluded.consent_status,consent_at=excluded.consent_at,consent_version=excluded.consent_version,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  return jsonb_build_object('saved',true,'customerId',p_customer_id,'updatedAt',v_version);
end $$;

create or replace function public.register_customer_care_media_atomic(p_business_id uuid,p_customer_id uuid,p_kind text,p_storage_path text,p_caption text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_existing public.customer_care_media%rowtype;
begin
  perform public.assert_customer_care_access(p_business_id,p_customer_id,true);
  if p_kind is null or p_kind not in ('before','after','document') or length(coalesce(p_caption,''))>300
    or not public.customer_care_path_access(p_storage_path,true)
    or split_part(p_storage_path,'/',1)<>p_business_id::text or split_part(p_storage_path,'/',2)<>p_customer_id::text
    or not exists(select 1 from storage.objects o where o.bucket_id='customer-care-assets' and o.name=p_storage_path)
    then raise exception 'CUSTOMER_CARE_INPUT_INVALID' using errcode='22023'; end if;
  perform 1 from public.customers c where c.id=p_customer_id and c.business_id=p_business_id for update;
  select * into v_existing from public.customer_care_media m where m.storage_path=p_storage_path;
  if v_existing.id is not null then
    if v_existing.business_id=p_business_id and v_existing.customer_id=p_customer_id and v_existing.kind=p_kind and v_existing.caption is not distinct from nullif(btrim(p_caption),'') then return v_existing.id; end if;
    raise exception 'CUSTOMER_CARE_MEDIA_EXISTS' using errcode='23505';
  end if;
  insert into public.customer_care_media(business_id,customer_id,kind,storage_path,caption,created_by)
    values(p_business_id,p_customer_id,p_kind,p_storage_path,nullif(btrim(p_caption),''),auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.native_customer_care_directory(p_business_id uuid,p_branch_id uuid,p_q text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_employee uuid; v_financial boolean; v_pattern text; v_rows jsonb; v_total bigint;
begin
  v_context:=public.customer_care_context(p_business_id,false); v_employee:=(v_context->>'employeeId')::uuid; v_financial:=(v_context->>'financialVisible')::boolean;
  if not exists(select 1 from public.branches b where b.id=p_branch_id and b.business_id=p_business_id and b.active) then raise exception 'CUSTOMER_CARE_ACCESS_DENIED' using errcode='42501'; end if;
  if p_q is null or length(p_q)>100 or p_offset is null or p_offset<0 or p_offset>100000 or p_offset%25<>0 then raise exception 'CUSTOMER_CARE_INPUT_INVALID' using errcode='22023'; end if;
  v_pattern:='%'||replace(replace(replace(btrim(p_q),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
  with scoped as(select c.* from public.customers c where c.business_id=p_business_id and (c.full_name ilike v_pattern or c.phone ilike v_pattern or coalesce(c.email,'') ilike v_pattern)
    and (v_context->>'visibility'='all' or exists(select 1 from public.appointments a where a.business_id=p_business_id and a.customer_id=c.id and a.employee_id=v_employee))),
    paged as(select * from scoped order by created_at desc,id desc limit 25 offset p_offset)
  select (select count(*) from scoped),coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'fullName',c.full_name,'phone',c.phone,'email',c.email,'notes',c.notes,'marketingConsent',c.marketing_consent,
    'totalVisits',c.total_visits,'totalSpendMinor',case when v_financial then c.total_spend_minor::text end,'lastVisitAt',c.last_visit_at,'createdAt',c.created_at,
    'profile',jsonb_build_object('allergies',coalesce(p.allergies,'{}'::text[]),'anamnesis',p.anamnesis,'treatmentNotes',p.treatment_notes,'consentStatus',coalesce(p.consent_status,'missing'),'consentAt',p.consent_at,'consentVersion',p.consent_version,'updatedAt',p.updated_at),
    'media',coalesce((select jsonb_agg(jsonb_build_object('type','media','id',m.id,'kind',m.kind,'storagePath',m.storage_path,'caption',m.caption,'createdAt',m.created_at) order by m.created_at desc,m.id desc) from (select * from public.customer_care_media mm where mm.business_id=p_business_id and mm.customer_id=c.id order by mm.created_at desc,mm.id desc limit 25) m),'[]'),
    'mediaTotal',(select count(*) from public.customer_care_media mm where mm.business_id=p_business_id and mm.customer_id=c.id)
  ) order by c.created_at desc,c.id desc),'[]') into v_total,v_rows from paged c left join public.customer_care_profiles p on p.customer_id=c.id and p.business_id=p_business_id;
  return jsonb_build_object('scope',(v_context-'visibility')||jsonb_build_object('businessId',p_business_id,'branchId',p_branch_id),'q',btrim(p_q),'offset',p_offset,'total',v_total,'hasMore',p_offset+jsonb_array_length(v_rows)<v_total,'rows',v_rows);
end $$;

create or replace function public.native_customer_care(p_business_id uuid,p_branch_id uuid,p_customer_id uuid,p_tab text default 'appointments',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_access jsonb; v_customer public.customers%rowtype; v_profile public.customer_care_profiles%rowtype; v_employee uuid; v_financial boolean; v_loyalty jsonb:=null; v_rows jsonb:='[]'; v_total bigint;
begin
  v_access:=public.assert_customer_care_access(p_business_id,p_customer_id,false);
  if not exists(select 1 from public.branches b where b.id=p_branch_id and b.business_id=p_business_id and b.active) then raise exception 'CUSTOMER_CARE_ACCESS_DENIED' using errcode='42501'; end if;
  if p_tab is null or p_tab not in ('appointments','loyalty','communications','media') or p_offset is null or p_offset<0 or p_offset>100000 or p_offset%25<>0 then raise exception 'CUSTOMER_CARE_INPUT_INVALID' using errcode='22023'; end if;
  v_employee:=(v_access->>'employeeId')::uuid; v_financial:=(v_access->>'financialVisible')::boolean;
  select * into v_customer from public.customers c where c.id=p_customer_id and c.business_id=p_business_id;
  select * into v_profile from public.customer_care_profiles p where p.customer_id=p_customer_id and p.business_id=p_business_id;
  if v_financial then
    select jsonb_build_object('points',l.points,'tier',l.tier,'updatedAt',l.updated_at,'recordedSince',(select min(m.occurred_at) from public.loyalty_point_movements m where m.business_id=p_business_id and m.customer_id=p_customer_id),'pastMovementsKnown',false)
      into v_loyalty from public.loyalty_accounts l where l.business_id=p_business_id and l.customer_id=p_customer_id;
  end if;
  if p_tab='appointments' then
    select count(*) into v_total from public.appointments a where a.business_id=p_business_id and a.branch_id=p_branch_id and a.customer_id=p_customer_id and (v_employee is null or a.employee_id=v_employee);
    select coalesce(jsonb_agg(r.row order by r.starts_at desc,r.id desc),'[]') into v_rows from (
      select a.id,a.starts_at,jsonb_build_object('type','appointment','id',a.id,'startsAt',a.starts_at,'endsAt',a.ends_at,'status',a.status,
        'employeeName',coalesce(e.display_name,'Uzman'),'branchName',b.name,
        'services',coalesce((select jsonb_agg(i.name_snapshot order by i.id) from public.appointment_items i where i.appointment_id=a.id and i.business_id=p_business_id),'[]'),
        'amountMinor',case when v_financial then a.total_minor::text end,'currency',case when v_financial then a.currency end) row
      from public.appointments a join public.branches b on b.id=a.branch_id and b.business_id=a.business_id left join public.employees e on e.id=a.employee_id and e.business_id=a.business_id
      where a.business_id=p_business_id and a.branch_id=p_branch_id and a.customer_id=p_customer_id and (v_employee is null or a.employee_id=v_employee) order by a.starts_at desc,a.id desc limit 25 offset p_offset
    ) r;
  elsif p_tab='loyalty' then
    if not v_financial then raise exception 'CUSTOMER_CARE_ACCESS_DENIED' using errcode='42501'; end if;
    select count(*) into v_total from public.loyalty_point_movements m where m.business_id=p_business_id and m.customer_id=p_customer_id;
    select coalesce(jsonb_agg(r.row order by r.occurred_at desc,r.id desc),'[]') into v_rows from (
      select m.id,m.occurred_at,jsonb_build_object('type','loyalty','id',m.id,'occurredAt',m.occurred_at,'kind',m.kind,'delta',m.delta,'balanceBefore',m.balance_before,'balanceAfter',m.balance_after) row
      from public.loyalty_point_movements m where m.business_id=p_business_id and m.customer_id=p_customer_id order by m.occurred_at desc,m.id desc limit 25 offset p_offset
    ) r;
  elsif p_tab='communications' then
    -- Only explicit, tenant-verified appointment/waitlist relations. Never infer
    -- identity from an address or expose recipient, message body or provider data.
    -- Drive the JSON-path GIN lookup from the customer's verified relations,
    -- not one correlated appointment query for every job in the business.
    with relations as(
      select jsonb_build_object('appointmentId',a.id::text) reference from public.appointments a where a.business_id=p_business_id and a.branch_id=p_branch_id and a.customer_id=p_customer_id and (v_employee is null or a.employee_id=v_employee)
      union all select jsonb_build_object('waitlistId',w.id::text) from public.waitlist_entries w where w.business_id=p_business_id and w.branch_id=p_branch_id and w.customer_id=p_customer_id and (v_employee is null or w.employee_id=v_employee)
    ), scoped as(select distinct j.id,j.channel,j.status,j.attempts,j.created_at,j.delivered_at from relations r
      join public.communication_jobs j on j.business_id=p_business_id and j.payload @> r.reference),
    paged as(select * from scoped order by created_at desc,id desc limit 25 offset p_offset)
    select (select count(*) from scoped),coalesce(jsonb_agg(jsonb_build_object('type','communication','id',p.id,'channel',p.channel,'status',p.status,'attempts',p.attempts,'createdAt',p.created_at,'deliveredAt',p.delivered_at) order by p.created_at desc,p.id desc),'[]') into v_total,v_rows from paged p;
  else
    select count(*) into v_total from public.customer_care_media m where m.business_id=p_business_id and m.customer_id=p_customer_id;
    select coalesce(jsonb_agg(r.row order by r.created_at desc,r.id desc),'[]') into v_rows from (
      select m.id,m.created_at,jsonb_build_object('type','media','id',m.id,'kind',m.kind,'storagePath',m.storage_path,'caption',m.caption,'createdAt',m.created_at) row
      from public.customer_care_media m where m.business_id=p_business_id and m.customer_id=p_customer_id order by m.created_at desc,m.id desc limit 25 offset p_offset
    ) r;
  end if;
  return jsonb_build_object(
    'scope',v_access||jsonb_build_object('businessId',p_business_id,'branchId',p_branch_id,'customerId',p_customer_id),
    'customer',jsonb_build_object('id',v_customer.id,'fullName',v_customer.full_name,'phone',v_customer.phone,'email',v_customer.email,'notes',v_customer.notes,'marketingConsent',v_customer.marketing_consent),
    'profile',jsonb_build_object('allergies',coalesce(v_profile.allergies,'{}'::text[]),'anamnesis',v_profile.anamnesis,'treatmentNotes',v_profile.treatment_notes,'consentStatus',coalesce(v_profile.consent_status,'missing'),'consentAt',v_profile.consent_at,'consentVersion',v_profile.consent_version,'updatedAt',v_profile.updated_at),
    'loyalty',v_loyalty,'page',jsonb_build_object('tab',p_tab,'offset',p_offset,'total',v_total,'hasMore',p_offset+jsonb_array_length(v_rows)<v_total,'rows',v_rows)
  );
end $$;

revoke all on function public.customer_care_context(uuid,boolean),public.assert_customer_care_access(uuid,uuid,boolean),public.record_customer_loyalty_change() from public,anon,authenticated;
revoke all on function public.can_access_customer_care(uuid,uuid),public.customer_care_path_access(text,boolean),public.save_customer_care_atomic(uuid,uuid,timestamptz,text[],text,text,text,text),public.register_customer_care_media_atomic(uuid,uuid,text,text,text),public.native_customer_care(uuid,uuid,uuid,text,integer),public.native_customer_care_directory(uuid,uuid,text,integer) from public,anon;
grant execute on function public.can_access_customer_care(uuid,uuid),public.customer_care_path_access(text,boolean),public.save_customer_care_atomic(uuid,uuid,timestamptz,text[],text,text,text,text),public.register_customer_care_media_atomic(uuid,uuid,text,text,text),public.native_customer_care(uuid,uuid,uuid,text,integer),public.native_customer_care_directory(uuid,uuid,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
