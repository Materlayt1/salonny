-- Native resumable setup. No automatic publication, no existing-data backfill.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Existing branch-tenant key is installed by 028/029/031. Validate all old
-- references rather than repairing/deleting inconsistent customer content.
alter table public.business_images add constraint native_images_tenant_branch_fk
 foreign key(business_id,branch_id) references public.branches(business_id,id) on delete cascade not valid;
alter table public.business_images validate constraint native_images_tenant_branch_fk;
alter table public.business_locations add constraint native_locations_tenant_branch_fk
 foreign key(business_id,branch_id) references public.branches(business_id,id) on delete cascade not valid;
alter table public.business_locations validate constraint native_locations_tenant_branch_fk;
alter table public.business_images add column if not exists native_content_sha256 text
  check(native_content_sha256 is null or native_content_sha256 ~ '^[0-9a-f]{64}$');

create or replace function public.native_business_setup_ready(p_business_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (p_business_id is null or exists(
   select 1 from public.business_members m where m.business_id=p_business_id and m.user_id=auth.uid()
     and m.active and m.role in ('OWNER','MANAGER')));
$$;
create or replace function public.native_start_business_setup(p_name text,p_description text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result record;
begin
 if auth.uid() is null then raise exception 'SETUP_FORBIDDEN' using errcode='42501'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 2 and 120 or char_length(coalesce(p_description,''))>4000 then raise exception 'SETUP_INPUT_INVALID' using errcode='22023'; end if;
 -- Serialise retries/concurrent starts by actor; legacy web starts are still
 -- resumable but are not claimed to share this new native lock.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':native-business-setup',0));
 select * into v_result from public.start_business_onboarding(btrim(p_name),nullif(btrim(coalesce(p_description,'')),''));
 return jsonb_build_object('businessId',v_result.business_id,'branchId',v_result.branch_id);
end; $$;

create or replace function public.native_submit_business_setup(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
 if auth.uid() is null or not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and active and role='OWNER') then raise exception 'SETUP_FORBIDDEN' using errcode='42501'; end if;
 select status into v_status from public.businesses where id=p_business_id for update;
 if not found or v_status='suspended' then raise exception 'SETUP_SUSPENDED' using errcode='42501'; end if;
 perform 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and active and role='OWNER' for share;
 if not found then raise exception 'SETUP_FORBIDDEN' using errcode='42501'; end if;
 return public.submit_business_for_review(p_business_id);
end; $$;

create or replace function public.native_save_business_setup(p_business_id uuid,p_branch_id uuid,p_action text,p_data jsonb,p_expected jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_business public.businesses%rowtype; v_location public.business_locations%rowtype;
 v_image public.business_images%rowtype; v_profile jsonb; v_current jsonb; v_covers jsonb;
 v_category uuid; v_image_id uuid; v_location_id uuid; v_count integer; v_path text;
begin
 if not public.native_business_setup_ready(p_business_id) or p_business_id is null or p_branch_id is null then raise exception 'SETUP_FORBIDDEN' using errcode='42501'; end if;
 select * into v_business from public.businesses where id=p_business_id for update;
 if not found then raise exception 'SETUP_FORBIDDEN' using errcode='42501'; end if;
 -- Recheck under row locks after acquiring the business lock. Revocation or
 -- branch deactivation cannot slip between this check and the mutation.
 perform 1 from public.business_members m where m.business_id=p_business_id and m.user_id=auth.uid() and m.active and m.role in ('OWNER','MANAGER') for share;
 if not found then raise exception 'SETUP_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.branches b where b.id=p_branch_id and b.business_id=p_business_id and b.active for share;
 if not found then raise exception 'SETUP_FORBIDDEN' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'SETUP_INPUT_INVALID' using errcode='22023'; end if;
 if p_action='profile' then
   if (select count(*) from jsonb_object_keys(p_data))<>8 or not (p_data ?& array['name','description','phone','whatsappPhone','email','websiteUrl','categoryId','revision'])
     or exists(select 1 from jsonb_each(p_data) e where e.key<>'categoryId' and jsonb_typeof(e.value)<>'string')
     or jsonb_typeof(p_data->'categoryId') not in ('string','null')
     or char_length(btrim(p_data->>'name')) not between 2 and 120 or char_length(p_data->>'description')>4000
     or char_length(p_data->>'phone')>30 or char_length(p_data->>'whatsappPhone')>30
     or char_length(p_data->>'email')>254 or char_length(p_data->>'websiteUrl')>500
     or ((p_data->>'phone')<>'' and ((p_data->>'phone')!~'^[+0-9 ()-]+$' or char_length(regexp_replace(p_data->>'phone','[^0-9]','','g')) not between 10 and 15))
     or ((p_data->>'whatsappPhone')<>'' and ((p_data->>'whatsappPhone')!~'^[+0-9 ()-]+$' or char_length(regexp_replace(p_data->>'whatsappPhone','[^0-9]','','g')) not between 10 and 15))
     or ((p_data->>'email')<>'' and (p_data->>'email')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or ((p_data->>'websiteUrl')<>'' and (p_data->>'websiteUrl')!~'^https?://[^[:space:]]+$') then raise exception 'SETUP_INPUT_INVALID' using errcode='22023'; end if;
   v_category := (p_data->>'categoryId')::uuid;
   if v_category is not null and not exists(select 1 from public.business_categories c where c.id=v_category and c.active) then raise exception 'SETUP_CATEGORY_INVALID' using errcode='22023'; end if;
   v_profile := jsonb_build_object('name',v_business.name,'description',coalesce(v_business.description,''),'phone',coalesce(v_business.phone,''),'whatsappPhone',coalesce(v_business.whatsapp_phone,''),'email',coalesce(v_business.email,''),'websiteUrl',coalesce(v_business.website_url,''),'categoryId',v_business.category_id);
   if v_profile=p_data-'revision' then return jsonb_build_object('saved',true); end if;
   if v_business.updated_at<>(p_data->>'revision')::timestamptz then raise exception 'SETUP_STALE' using errcode='40001'; end if;
   update public.businesses set name=btrim(p_data->>'name'),description=nullif(btrim(p_data->>'description'),''),phone=nullif(btrim(p_data->>'phone'),''),whatsapp_phone=nullif(btrim(p_data->>'whatsappPhone'),''),email=nullif(btrim(p_data->>'email'),''),website_url=nullif(btrim(p_data->>'websiteUrl'),''),category_id=v_category,updated_at=now() where id=p_business_id;
 elsif p_action='location' then
   if (select count(*) from jsonb_object_keys(p_data))<>7 or not(p_data ?& array['id','addressLine','district','city','postalCode','latitude','longitude'])
     or exists(select 1 from jsonb_each(p_data) e where e.key not in ('latitude','longitude') and jsonb_typeof(e.value)<>'string')
     or jsonb_typeof(p_data->'latitude')<>'number' or jsonb_typeof(p_data->'longitude')<>'number'
     or char_length(btrim(p_data->>'addressLine')) not between 5 and 500 or char_length(btrim(p_data->>'district')) not between 2 and 100 or char_length(btrim(p_data->>'city')) not between 2 and 100 or char_length(p_data->>'postalCode')>16
     or (p_data->>'latitude')::numeric not between 35 and 43 or (p_data->>'longitude')::numeric not between 25 and 46 then raise exception 'SETUP_INPUT_INVALID' using errcode='22023'; end if;
   v_location_id := (p_data->>'id')::uuid;
   select count(*) into v_count from public.business_locations l where l.business_id=p_business_id and l.branch_id=p_branch_id;
   if v_count>1 then raise exception 'SETUP_LOCATION_AMBIGUOUS' using errcode='23514'; end if;
   select * into v_location from public.business_locations l where l.business_id=p_business_id and l.branch_id=p_branch_id for update;
   v_current := case when v_count=0 then null else jsonb_build_object('id',v_location.id,'addressLine',v_location.address_line,'district',v_location.district,'city',v_location.city,'postalCode',coalesce(v_location.postal_code,''),'latitude',v_location.latitude,'longitude',v_location.longitude) end;
   if v_current=p_data then return jsonb_build_object('saved',true); end if;
   if v_current is distinct from p_expected or (v_count=1 and v_location.id<>v_location_id) then raise exception 'SETUP_STALE' using errcode='40001'; end if;
   if v_count=0 then
     insert into public.business_locations(id,business_id,branch_id,address_line,district,city,postal_code,latitude,longitude)
       values(v_location_id,p_business_id,p_branch_id,btrim(p_data->>'addressLine'),btrim(p_data->>'district'),btrim(p_data->>'city'),nullif(btrim(p_data->>'postalCode'),''),(p_data->>'latitude')::numeric,(p_data->>'longitude')::numeric);
   else update public.business_locations set address_line=btrim(p_data->>'addressLine'),district=btrim(p_data->>'district'),city=btrim(p_data->>'city'),postal_code=nullif(btrim(p_data->>'postalCode'),''),latitude=(p_data->>'latitude')::numeric,longitude=(p_data->>'longitude')::numeric,geohash=null where id=v_location_id; end if;
 elsif p_action='image' then
   if (select count(*) from jsonb_object_keys(p_data))<>3 or not(p_data ?& array['id','altText','contentHash']) or exists(select 1 from jsonb_each(p_data) e where jsonb_typeof(e.value)<>'string')
     or char_length(btrim(p_data->>'altText')) not between 2 and 160 or (p_data->>'contentHash')!~'^[0-9a-f]{64}$' then raise exception 'SETUP_INPUT_INVALID' using errcode='22023'; end if;
   v_image_id := (p_data->>'id')::uuid;
   v_path := 'business/'||p_business_id::text||'/native-'||v_image_id::text||'.jpg';
   select * into v_image from public.business_images where id=v_image_id;
   if found then
     if v_image.business_id<>p_business_id or v_image.branch_id is distinct from p_branch_id or v_image.storage_path<>v_path or v_image.native_content_sha256 is distinct from p_data->>'contentHash' or v_image.alt_text is distinct from btrim(p_data->>'altText') then raise exception 'SETUP_IMAGE_CONFLICT' using errcode='23505'; end if;
     return jsonb_build_object('saved',true);
   end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='business-assets' and o.name=v_path) then raise exception 'SETUP_IMAGE_NOT_UPLOADED' using errcode='23514'; end if;
   select count(*) into v_count from public.business_images where business_id=p_business_id;
   if v_count>=50 then raise exception 'SETUP_IMAGE_LIMIT' using errcode='23514'; end if;
   insert into public.business_images(id,business_id,branch_id,storage_path,alt_text,kind,sort_order,native_content_sha256)
     values(v_image_id,p_business_id,p_branch_id,v_path,btrim(p_data->>'altText'),case when not exists(select 1 from public.business_images where business_id=p_business_id and kind='cover') then 'cover' else 'gallery' end,coalesce((select max(sort_order)+1 from public.business_images where business_id=p_business_id),0),p_data->>'contentHash');
 elsif p_action='cover' then
   if (select count(*) from jsonb_object_keys(p_data))<>1 or jsonb_typeof(p_data->'id')<>'string' or p_expected is null or jsonb_typeof(p_expected)<>'array' then raise exception 'SETUP_INPUT_INVALID' using errcode='22023'; end if;
   v_image_id := (p_data->>'id')::uuid;
   if not exists(select 1 from public.business_images where id=v_image_id and business_id=p_business_id) then raise exception 'SETUP_FORBIDDEN' using errcode='42501'; end if;
   select coalesce(jsonb_agg(id order by id),'[]'::jsonb) into v_covers from public.business_images where business_id=p_business_id and kind='cover';
   if v_covers=jsonb_build_array(v_image_id) then return jsonb_build_object('saved',true); end if;
   if v_covers<>p_expected then raise exception 'SETUP_STALE' using errcode='40001'; end if;
   update public.business_images set kind='gallery' where business_id=p_business_id and kind='cover';
   update public.business_images set kind='cover' where id=v_image_id;
 else raise exception 'SETUP_INPUT_INVALID' using errcode='22023'; end if;
 return jsonb_build_object('saved',true);
end; $$;
revoke all on function public.native_business_setup_ready(uuid) from public,anon;
revoke all on function public.native_start_business_setup(text,text) from public,anon;
revoke all on function public.native_submit_business_setup(uuid) from public,anon;
revoke all on function public.native_save_business_setup(uuid,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.native_business_setup_ready(uuid),public.native_start_business_setup(text,text),public.native_submit_business_setup(uuid),public.native_save_business_setup(uuid,uuid,text,jsonb,jsonb) to authenticated;

-- Ordinary employees must not replace/delete public business photos through
-- a direct Storage request when the native management screen denies them.
create or replace function public.native_business_asset_manager(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_business text := split_part(p_name,'/',2);
begin
 if auth.uid() is null or p_name is null or split_part(p_name,'/',1)<>'business' or v_business !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or p_name like '%..%' then return false; end if;
 return public.native_business_setup_ready(v_business::uuid);
end; $$;
revoke all on function public.native_business_asset_manager(text) from public,anon;
grant execute on function public.native_business_asset_manager(text) to authenticated;
drop policy if exists business_assets_member_insert on storage.objects;
drop policy if exists business_assets_member_update on storage.objects;
drop policy if exists business_assets_member_delete on storage.objects;
-- Public URLs remain public for this public bucket, but authenticated Storage
-- download/list/update also need SELECT. Only owned manager folders are listed.
drop policy if exists business_assets_manager_read on storage.objects;
create policy business_assets_manager_read on storage.objects for select to authenticated
 using(bucket_id='business-assets' and public.native_business_asset_manager(name));
create policy business_assets_member_insert on storage.objects for insert to authenticated
 with check(bucket_id='business-assets' and public.native_business_asset_manager(name));
create policy business_assets_member_update on storage.objects for update to authenticated
 using(bucket_id='business-assets' and public.native_business_asset_manager(name))
 with check(bucket_id='business-assets' and public.native_business_asset_manager(name));
create policy business_assets_member_delete on storage.objects for delete to authenticated
 using(bucket_id='business-assets' and public.native_business_asset_manager(name));
notify pgrst,'reload schema';
commit;
