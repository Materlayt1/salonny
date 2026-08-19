-- Map only the safe, user-selectable signup roles into the application profile.
-- ADMIN is intentionally never accepted from user metadata.

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, full_name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.phone,
    case when new.raw_user_meta_data ->> 'requested_role' = 'business'
      then 'BUSINESS_OWNER'::public.app_role
      else 'CUSTOMER'::public.app_role
    end
  )
  on conflict (id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;

revoke all on function public.handle_new_auth_user() from public;
