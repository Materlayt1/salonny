-- Secure, resumable business onboarding. A public profile is never published directly.

create unique index if not exists business_hours_branch_weekday_idx
  on public.business_hours(branch_id, weekday);

create or replace function public.start_business_onboarding(
  p_name text,
  p_description text default null
)
returns table(business_id uuid, branch_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_branch_id uuid;
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'business_name_required';
  end if;

  select bm.business_id, br.id into v_business_id, v_branch_id
  from public.business_members bm
  join public.businesses b on b.id = bm.business_id
  left join public.branches br on br.business_id = bm.business_id and br.is_primary
  where bm.user_id = v_user_id and bm.active and bm.role = 'OWNER'
  order by bm.created_at
  limit 1;

  if v_business_id is not null then
    if v_branch_id is null then
      insert into public.branches (business_id, name, slug, is_primary)
      values (v_business_id, 'Merkez', 'merkez', true)
      returning id into v_branch_id;
    end if;
    return query select v_business_id, v_branch_id;
    return;
  end if;

  v_slug := trim(both '-' from regexp_replace(
    translate(lower(trim(p_name)), 'çğıöşü', 'cgiosu'),
    '[^a-z0-9]+', '-', 'g'
  )) || '-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6);

  update public.users
  set role = case when role = 'CUSTOMER' then 'BUSINESS_OWNER'::public.app_role else role end
  where id = v_user_id;

  insert into public.businesses (owner_user_id, name, slug, description, status)
  values (v_user_id, trim(p_name), v_slug, nullif(trim(coalesce(p_description, '')), ''), 'draft')
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role, active)
  values (v_business_id, v_user_id, 'OWNER', true);

  insert into public.branches (business_id, name, slug, is_primary)
  values (v_business_id, 'Merkez', 'merkez', true)
  returning id into v_branch_id;

  insert into public.business_settings (business_id) values (v_business_id);
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (v_business_id, v_user_id, 'business_onboarding_started', 'business', v_business_id::text, jsonb_build_object('name', trim(p_name)));

  return query select v_business_id, v_branch_id;
end;
$$;

create or replace function public.submit_business_for_review(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses%rowtype;
  v_missing text[] := array[]::text[];
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.has_business_role(p_business_id, array['OWNER']::public.business_member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into strict v_business from public.businesses where id = p_business_id for update;
  if char_length(trim(v_business.name)) < 2 then v_missing := array_append(v_missing, 'İşletme bilgileri'); end if;
  if v_business.category_id is null then v_missing := array_append(v_missing, 'Kategori'); end if;
  if not exists (select 1 from public.business_locations where business_id = p_business_id) then v_missing := array_append(v_missing, 'Konum'); end if;
  if nullif(trim(coalesce(v_business.phone, '')), '') is null then v_missing := array_append(v_missing, 'İletişim'); end if;
  if not exists (select 1 from public.business_images where business_id = p_business_id) then v_missing := array_append(v_missing, 'Fotoğraflar'); end if;
  if not exists (select 1 from public.business_hours where business_id = p_business_id and not is_closed) then v_missing := array_append(v_missing, 'Çalışma saatleri'); end if;
  if not exists (select 1 from public.services where business_id = p_business_id and active) then v_missing := array_append(v_missing, 'Hizmetler'); end if;
  if not exists (select 1 from public.employees where business_id = p_business_id and active) then v_missing := array_append(v_missing, 'Ekip'); end if;
  if not exists (select 1 from public.business_settings where business_id = p_business_id) then v_missing := array_append(v_missing, 'Randevu ayarları'); end if;

  if cardinality(v_missing) > 0 then
    return jsonb_build_object('submitted', false, 'status', v_business.status, 'missing', to_jsonb(v_missing));
  end if;

  if v_business.status in ('draft', 'pending_review') then
    update public.businesses set status = 'pending_review', onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = p_business_id;
    insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id)
    values (p_business_id, auth.uid(), 'business_submitted_for_review', 'business', p_business_id::text);
  end if;

  return jsonb_build_object('submitted', true, 'status', case when v_business.status = 'published' then 'published' else 'pending_review' end, 'missing', '[]'::jsonb);
end;
$$;

-- Keep the role/phone projection aligned with the richer signup form.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, full_name, phone, role, city)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone'),
    case when new.raw_user_meta_data ->> 'requested_role' = 'business'
      then 'BUSINESS_OWNER'::public.app_role
      else 'CUSTOMER'::public.app_role
    end,
    new.raw_user_meta_data ->> 'city'
  )
  on conflict (id) do update set
    full_name = coalesce(public.users.full_name, excluded.full_name),
    phone = coalesce(public.users.phone, excluded.phone),
    city = coalesce(public.users.city, excluded.city);
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;

revoke all on function public.start_business_onboarding(text,text) from public;
revoke all on function public.submit_business_for_review(uuid) from public;
grant execute on function public.start_business_onboarding(text,text) to authenticated;
grant execute on function public.submit_business_for_review(uuid) to authenticated;
revoke all on function public.handle_new_auth_user() from public;
