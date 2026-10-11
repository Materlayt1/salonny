-- Read-only production verification. Expected: 8, false, false, true, false, 2.
select
  (select count(*) from pg_policies where schemaname='public' and tablename in
    ('waitlist_entries','business_resources','customer_care_profiles','customer_care_media','business_member_permissions','communication_jobs')) as protected_policy_count,
  has_function_privilege('anon','public.claim_communication_jobs(integer,uuid)','EXECUTE') as anon_can_claim,
  has_function_privilege('authenticated','public.claim_communication_jobs(integer,uuid)','EXECUTE') as user_can_claim,
  has_function_privilege('service_role','public.claim_communication_jobs(integer,uuid)','EXECUTE') as service_can_claim,
  (select public from storage.buckets where id='customer-care-assets') as care_bucket_public,
  (select count(*) from pg_trigger where tgname in
    ('appointment_item_reserve_resources','appointment_lifecycle_automation') and not tgisinternal) as automation_triggers;

-- Expected: every value is false. These helpers are trigger/internal only.
select
  has_function_privilege('anon','public.handle_new_auth_user()','EXECUTE') as anon_can_call_auth_trigger,
  has_function_privilege('authenticated','public.handle_new_auth_user()','EXECUTE') as user_can_call_auth_trigger,
  has_function_privilege('anon','public.handle_review_rating_change()','EXECUTE') as anon_can_call_rating_trigger,
  has_function_privilege('authenticated','public.handle_review_rating_change()','EXECUTE') as user_can_call_rating_trigger,
  has_function_privilege('anon','public.refresh_business_rating(uuid)','EXECUTE') as anon_can_refresh_ratings,
  has_function_privilege('authenticated','public.refresh_business_rating(uuid)','EXECUTE') as user_can_refresh_ratings;
