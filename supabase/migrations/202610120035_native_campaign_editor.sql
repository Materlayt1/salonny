-- Explicit-tenant campaign editor. The 032 one-use ledger is immutable here.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.campaigns,public.discounts in share row exclusive mode;
do $$ begin
  if exists(select 1 from public.discounts d join public.campaigns c on c.id=d.campaign_id where d.business_id<>c.business_id) then
    raise exception 'campaign_tenant_integrity_violation: review required; no changes made' using errcode='23514';
  end if;
end $$;
alter table public.campaigns add column revision integer not null default 0 check(revision>=0);
create index campaigns_business_editor_order_idx on public.campaigns(business_id,created_at desc,id);
create index discounts_campaign_editor_idx on public.discounts(campaign_id,id);
create table public.campaign_editor_requests(
  business_id uuid not null references public.businesses(id) on delete restrict,
  request_id uuid not null, actor_user_id uuid not null,
  payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(business_id,request_id)
);
alter table public.campaign_editor_requests enable row level security;
revoke all privileges on public.campaign_editor_requests from public,anon,authenticated;
-- RPCs remain the only ordinary mutation path. Removing column grants as well
-- prevents old column-level privileges from bypassing the table-level seal.
revoke insert,update,delete,truncate on public.campaigns,public.discounts from public,anon,authenticated;
do $$ declare r record; begin
  for r in select table_name,column_name,privilege_type,grantee from information_schema.column_privileges
    where table_schema='public' and table_name in('campaigns','discounts') and privilege_type in('INSERT','UPDATE') and grantee in('PUBLIC','anon','authenticated')
  loop execute format('revoke %s (%I) on public.%I from %s',r.privilege_type,r.column_name,r.table_name,case when r.grantee='PUBLIC' then 'public' else quote_ident(r.grantee) end); end loop;
end $$;

create or replace function public.campaign_editor_authorize(p_business_id uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
  if p_business_id is null or not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and active and role in('OWNER','MANAGER')) then
    raise exception 'CAMPAIGN_ACCESS_DENIED' using errcode='42501';
  end if;
end $$;
revoke execute on function public.campaign_editor_authorize(uuid) from public,anon,authenticated;

create or replace function public.campaign_editor_row(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.campaigns%rowtype; d public.discounts%rowtype; n integer; v_legacy boolean; v_used boolean; v_terms jsonb;
begin
  select * into c from public.campaigns where id=p_campaign_id;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0001'; end if;
  select count(*) into n from public.discounts where campaign_id=c.id;
  if n=1 then select * into d from public.discounts where campaign_id=c.id; end if;
  v_legacy:=n<>1 or d.business_id is distinct from c.business_id or upper(trim(coalesce(d.code,''))) !~ '^[A-Z0-9_-]{3,30}$'
    or d.value is null or d.value<1 or d.value>100000000 or d.kind not in('percentage','fixed') or (d.kind='percentage' and d.value>100)
    or coalesce(c.audience_filter->>'segment','all') not in('all','new','loyal','inactive')
    or (d.starts_at is not null and not isfinite(d.starts_at)) or (d.ends_at is not null and not isfinite(d.ends_at))
    or coalesce(d.starts_at>=d.ends_at,false);
  -- SQL three-valued comparisons must not turn a legacy row into editable.
  v_legacy:=coalesce(v_legacy,true);
  if not v_legacy then
    v_terms:=jsonb_build_object('code',upper(trim(d.code)),'kind',d.kind,'value',d.value,'audience',coalesce(c.audience_filter->>'segment','all'),'startsAt',d.starts_at,'endsAt',d.ends_at);
  end if;
  select exists(select 1 from public.coupon_redemptions r where r.business_id=c.business_id and
    (r.discount_id in(select id from public.discounts where campaign_id=c.id) or exists(select 1 from public.discounts x where x.campaign_id=c.id and upper(trim(x.code))=upper(trim(r.code))))) into v_used;
  return jsonb_build_object('id',c.id,'businessId',c.business_id,'name',c.name,'status',c.status,'revision',c.revision,'terms',v_terms,
    'termsEditable',not v_legacy and not v_used,'lockReason',case when v_legacy then 'legacy' when v_used then 'used' else null end);
end $$;
revoke execute on function public.campaign_editor_row(uuid) from public,anon,authenticated;

create or replace function public.native_business_campaigns(p_business_id uuid,p_query text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n bigint; rows jsonb;
begin
  perform public.campaign_editor_authorize(p_business_id);
  if p_query is null or char_length(p_query)>120 or p_offset is null or p_offset<0 or p_offset>1000000 or p_offset%25<>0 then raise exception 'CAMPAIGN_INPUT_INVALID' using errcode='22023'; end if;
  select count(*) into n from public.campaigns where business_id=p_business_id and position(lower(trim(p_query)) in lower(name))>0;
  select coalesce(jsonb_agg(public.campaign_editor_row(id) order by created_at desc,id),'[]'::jsonb) into rows from
    (select id,created_at from public.campaigns where business_id=p_business_id and position(lower(trim(p_query)) in lower(name))>0 order by created_at desc,id offset p_offset limit 25) q;
  return jsonb_build_object('businessId',p_business_id,'offset',p_offset,'total',n,'hasMore',p_offset+jsonb_array_length(rows)<n,'rows',rows);
end $$;
revoke execute on function public.native_business_campaigns(uuid,text,integer) from public,anon;
grant execute on function public.native_business_campaigns(uuid,text,integer) to authenticated;

create or replace function public.native_save_business_campaign(
  p_business_id uuid,p_campaign_id uuid,p_request_id uuid,p_expected_revision integer,p_operation text,
  p_name text,p_status text,p_code text,p_kind text,p_value integer,p_audience text,p_starts_at timestamptz,p_ends_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.campaigns%rowtype; d public.discounts%rowtype; n integer; v_id uuid; v_status text;
  v_payload jsonb; v_request public.campaign_editor_requests%rowtype; v_result jsonb; v_used boolean; v_changed boolean;
begin
  perform public.campaign_editor_authorize(p_business_id);
  if p_request_id is null or p_operation is null or p_operation not in('save','metadata') or p_status is null or p_status not in('draft','active','cancelled')
    or char_length(trim(coalesce(p_name,''))) not between 2 and 140 or ((p_campaign_id is null)<>(p_expected_revision is null))
    or (p_expected_revision is not null and (p_expected_revision<0 or p_expected_revision>=2147483647)) or (p_operation='metadata' and p_campaign_id is null)
  then raise exception 'CAMPAIGN_INPUT_INVALID' using errcode='22023'; end if;
  if p_operation='save' then
    if upper(trim(coalesce(p_code,''))) !~ '^[A-Z0-9_-]{3,30}$' or p_kind is null or p_kind not in('percentage','fixed')
      or p_value is null or p_value<1 or p_value>100000000 or (p_kind='percentage' and p_value>100) or p_audience is null or p_audience not in('all','new','loyal','inactive')
      or (p_starts_at is not null and not isfinite(p_starts_at)) or (p_ends_at is not null and not isfinite(p_ends_at)) or p_starts_at>=p_ends_at
    then raise exception 'CAMPAIGN_INPUT_INVALID' using errcode='22023'; end if;
  elsif p_code is not null or p_kind is not null or p_value is not null or p_audience is not null or p_starts_at is not null or p_ends_at is not null then
    raise exception 'CAMPAIGN_INPUT_INVALID' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object('id',p_campaign_id,'revision',p_expected_revision,'operation',p_operation,'name',trim(p_name),'status',p_status,'code',upper(trim(p_code)),
    'kind',p_kind,'value',p_value,'audience',p_audience,'startsAt',p_starts_at,'endsAt',p_ends_at);
  perform pg_advisory_xact_lock(hashtextextended('campaign-editor:'||p_business_id::text||':'||p_request_id::text,0));
  select * into v_request from public.campaign_editor_requests where business_id=p_business_id and request_id=p_request_id;
  if found then
    if v_request.actor_user_id is distinct from auth.uid() or v_request.payload is distinct from v_payload then raise exception 'CAMPAIGN_REQUEST_CONFLICT' using errcode='P0001'; end if;
    return v_request.result;
  end if;
  if p_campaign_id is null then
    if exists(select 1 from public.coupon_redemptions where business_id=p_business_id and upper(trim(code))=upper(trim(p_code))) then raise exception 'CAMPAIGN_CODE_USED' using errcode='P0001'; end if;
    v_status:=case when p_status='active' and p_starts_at>now() then 'scheduled' else p_status end;
    insert into public.campaigns(business_id,name,audience_filter,content,status,scheduled_at,created_by)
      values(p_business_id,trim(p_name),jsonb_build_object('segment',p_audience),jsonb_build_object('discount_code',upper(trim(p_code))),v_status,p_starts_at,auth.uid()) returning id into v_id;
    insert into public.discounts(business_id,campaign_id,code,kind,value,starts_at,ends_at,active)
      values(p_business_id,v_id,upper(trim(p_code)),p_kind,p_value,p_starts_at,p_ends_at,v_status in('active','scheduled'));
  else
    -- Same campaign -> discount order as 032 booking. A redemption that already
    -- holds SHARE commits before this UPDATE lock, so its ledger is visible.
    select * into c from public.campaigns where id=p_campaign_id and business_id=p_business_id for update;
    if not found then raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0001'; end if;
    if c.revision<>p_expected_revision then raise exception 'CAMPAIGN_STALE' using errcode='P0001'; end if;
    perform 1 from public.discounts where campaign_id=c.id order by id for update;
    select count(*) into n from public.discounts where campaign_id=c.id;
    if exists(select 1 from public.discounts where campaign_id=c.id and business_id<>p_business_id) then raise exception 'CAMPAIGN_ACCESS_DENIED' using errcode='42501'; end if;
    if n=1 then select * into d from public.discounts where campaign_id=c.id; end if;
    if p_operation='save' then
      if n<>1 then raise exception 'CAMPAIGN_LEGACY_TERMS' using errcode='P0001'; end if;
      select exists(select 1 from public.coupon_redemptions r where r.business_id=p_business_id and (r.discount_id=d.id or upper(trim(r.code))=upper(trim(d.code)))) into v_used;
      v_changed:=upper(trim(d.code)) is distinct from upper(trim(p_code)) or d.kind is distinct from p_kind or d.value is distinct from p_value
        or d.starts_at is distinct from p_starts_at or d.ends_at is distinct from p_ends_at or coalesce(c.audience_filter->>'segment','all') is distinct from p_audience;
      if v_used and v_changed then raise exception 'CAMPAIGN_TERMS_LOCKED' using errcode='P0001'; end if;
      if not v_used and exists(select 1 from public.coupon_redemptions where business_id=p_business_id and upper(trim(code))=upper(trim(p_code))) then raise exception 'CAMPAIGN_CODE_USED' using errcode='P0001'; end if;
      update public.discounts set code=upper(trim(p_code)),kind=p_kind,value=p_value,starts_at=p_starts_at,ends_at=p_ends_at where id=d.id;
    end if;
    v_status:=case when p_status='active' and (case when p_operation='save' then p_starts_at else c.scheduled_at end)>now() then 'scheduled' else p_status end;
    update public.campaigns set name=trim(p_name),status=v_status,revision=revision+1,
      audience_filter=case when p_operation='save' then audience_filter||jsonb_build_object('segment',p_audience) else audience_filter end,
      content=case when p_operation='save' then content||jsonb_build_object('discount_code',upper(trim(p_code))) else content end,
      scheduled_at=case when p_operation='save' then p_starts_at else scheduled_at end where id=c.id;
    update public.discounts set active=v_status in('active','scheduled') where campaign_id=c.id and business_id=p_business_id;
    v_id:=c.id;
  end if;
  v_result:=public.campaign_editor_row(v_id);
  insert into public.campaign_editor_requests(business_id,request_id,actor_user_id,payload,result) values(p_business_id,p_request_id,auth.uid(),v_payload,v_result);
  insert into public.audit_logs(business_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_business_id,auth.uid(),case when p_campaign_id is null then 'campaign.created' else 'campaign.updated' end,'campaign',v_id::text,
      case when p_campaign_id is null then null else jsonb_build_object('revision',c.revision,'status',c.status) end,v_result);
  return v_result;
end $$;
revoke execute on function public.native_save_business_campaign(uuid,uuid,uuid,integer,text,text,text,text,text,integer,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.native_save_business_campaign(uuid,uuid,uuid,integer,text,text,text,text,text,integer,text,timestamptz,timestamptz) to authenticated;

-- Preserve old web/native callers; creation still chooses the first authorized
-- business, while the new editor passes its explicit selected business.
create or replace function public.create_business_campaign(p_name text,p_code text,p_kind text,p_value integer,p_audience text default 'all',p_starts_at timestamptz default null,p_ends_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid; r jsonb; begin
  select business_id into b from public.business_members where user_id=auth.uid() and active and role in('OWNER','MANAGER') order by created_at limit 1;
  r:=public.native_save_business_campaign(b,null,gen_random_uuid(),null,'save',p_name,'active',p_code,p_kind,p_value,p_audience,p_starts_at,p_ends_at);
  return (r->>'id')::uuid;
end $$;
create or replace function public.set_business_campaign_status(p_campaign_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.campaigns%rowtype; begin
  select * into c from public.campaigns where id=p_campaign_id;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0001'; end if;
  perform public.campaign_editor_authorize(c.business_id);
  return public.native_save_business_campaign(c.business_id,c.id,gen_random_uuid(),c.revision,'metadata',c.name,p_status,null,null,null,null,null,null);
end $$;
revoke execute on function public.create_business_campaign(text,text,text,integer,text,timestamptz,timestamptz),public.set_business_campaign_status(uuid,text) from public,anon;
grant execute on function public.create_business_campaign(text,text,text,integer,text,timestamptz,timestamptz),public.set_business_campaign_status(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
