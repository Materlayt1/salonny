-- Internal maintenance functions run from trusted triggers or from other
-- SECURITY DEFINER functions. They must never be callable through PostgREST.

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.handle_review_rating_change() from public, anon, authenticated;
revoke all on function public.refresh_business_rating(uuid) from public, anon, authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE')
    or has_function_privilege('anon', 'public.handle_review_rating_change()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.handle_review_rating_change()', 'EXECUTE')
    or has_function_privilege('anon', 'public.refresh_business_rating(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.refresh_business_rating(uuid)', 'EXECUTE') then
    raise exception 'internal_security_definer_acl_hardening_failed';
  end if;
end;
$$;
