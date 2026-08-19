-- Audited admin operations. All functions verify the caller's ADMIN role server-side.

create or replace function public.admin_review_business(p_business_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.businesses%rowtype;
  v_after public.businesses%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'suspend', 'return_review', 'verify', 'unverify') then
    raise exception 'invalid_admin_action';
  end if;

  select * into strict v_before from public.businesses where id = p_business_id for update;

  update public.businesses
  set
    status = case p_action
      when 'approve' then 'published'
      when 'suspend' then 'suspended'
      when 'return_review' then 'draft'
      else status
    end,
    verified_at = case p_action
      when 'approve' then coalesce(verified_at, now())
      when 'verify' then coalesce(verified_at, now())
      when 'unverify' then null
      when 'return_review' then null
      else verified_at
    end
  where id = p_business_id
  returning * into v_after;

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    p_business_id,
    auth.uid(),
    'admin_business_' || p_action,
    'business',
    p_business_id::text,
    jsonb_build_object('status', v_before.status, 'verified_at', v_before.verified_at),
    jsonb_build_object('status', v_after.status, 'verified_at', v_after.verified_at)
  );

  return jsonb_build_object('id', v_after.id, 'status', v_after.status, 'verified_at', v_after.verified_at);
end;
$$;

create or replace function public.admin_moderate_review(p_review_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'flagged') then
    raise exception 'invalid_moderation_status';
  end if;

  update public.reviews set moderation_status = p_status where id = p_review_id returning * into strict v_review;
  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (v_review.business_id, auth.uid(), 'admin_review_' || p_status, 'review', p_review_id::text, jsonb_build_object('moderation_status', p_status));
  return jsonb_build_object('id', v_review.id, 'moderation_status', v_review.moderation_status);
end;
$$;

create or replace function public.admin_set_category_active(p_category_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.business_categories%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.business_categories set active = p_active where id = p_category_id returning * into strict v_category;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
  values (auth.uid(), 'admin_category_updated', 'business_category', p_category_id::text, jsonb_build_object('active', p_active));
  return jsonb_build_object('id', v_category.id, 'active', v_category.active);
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.app_role)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.app_role;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_change_own_admin_role';
  end if;
  select role into strict v_before from public.users where id = p_user_id for update;
  update public.users set role = p_role where id = p_user_id;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (auth.uid(), 'admin_user_role_changed', 'user', p_user_id::text, jsonb_build_object('role', v_before), jsonb_build_object('role', p_role));
  return jsonb_build_object('id', p_user_id, 'role', p_role);
end;
$$;

revoke all on function public.admin_review_business(uuid,text) from public;
revoke all on function public.admin_moderate_review(uuid,text) from public;
revoke all on function public.admin_set_category_active(uuid,boolean) from public;
revoke all on function public.admin_set_user_role(uuid,public.app_role) from public;

grant execute on function public.admin_review_business(uuid,text) to authenticated;
grant execute on function public.admin_moderate_review(uuid,text) to authenticated;
grant execute on function public.admin_set_category_active(uuid,boolean) to authenticated;
grant execute on function public.admin_set_user_role(uuid,public.app_role) to authenticated;
