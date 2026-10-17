-- Read-only catalogue acceptance; never creates a customer, appointment or SMS.
with expected(signature,client_execute) as(values
 ('public.assert_customer_booking_allowed(uuid,uuid)',false),
 ('public.customer_booking_payload(uuid,uuid,uuid,timestamptz,text,text,text)',false),
 ('public.guard_appointment_customer_policy()',false),
 ('public.guard_review_self_policy()',false),
 ('public.guard_waitlist_self_policy()',false),
 ('public.create_appointment_atomic(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)',true),
 ('public.create_appointment_with_coupon(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text)',true),
 ('public.quote_customer_coupon(uuid,uuid,uuid,uuid,text)',true),
 ('public.get_appointment_reschedule_slots(uuid,date)',true),
 ('public.reschedule_customer_appointment(uuid,timestamptz)',true)
), routines as (
 select e.*,p.oid,p.prosecdef,p.proconfig,p.proacl,p.proowner,p.prosrc
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), checks as (
 select 'ten_policy_functions_installed' check_name,count(oid)=10 passed from routines
 union all select 'exact_client_and_anonymous_function_acl',coalesce(bool_and(oid is not null
  and has_function_privilege('authenticated',oid,'EXECUTE')=client_execute
  and not has_function_privilege('anon',oid,'EXECUTE')
  and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')),false) from routines
 union all select 'fixed_function_search_path',coalesce(bool_and(oid is not null
  and exists(select 1 from unnest(proconfig) c where c in('search_path=""','search_path='))),false) from routines
 union all select 'only_payload_is_invoker',coalesce(bool_and(prosecdef=(signature<>'public.customer_booking_payload(uuid,uuid,uuid,timestamptz,text,text,text)')),false) from routines
 union all select 'private_ledger_rls',(select relrowsecurity from pg_class where oid=to_regclass('public.customer_booking_requests'))
 union all select 'no_client_ledger_table_or_column_acl',not exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  where c.oid=to_regclass('public.customer_booking_requests') and a.grantee in(0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')))
  and not exists(select 1 from pg_attribute c cross join lateral aclexplode(c.attacl) a where c.attrelid=to_regclass('public.customer_booking_requests')
    and a.grantee in(0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')))
 union all select 'three_enabled_policy_triggers',count(*)=3 and coalesce(bool_and(tgenabled='O'),false) from pg_trigger
  where tgname in('appointment_customer_policy_guard','review_self_policy_guard','waitlist_self_policy_guard') and not tgisinternal
 union all select 'two_validated_customer_exclusions',count(*)=2 and coalesce(bool_and(contype='x' and convalidated),false) from pg_constraint
  where conrelid='public.appointments'::regclass and conname in('appointments_customer_no_overlap','appointments_customer_record_no_overlap')
 union all select 'three_ledger_restrict_foreign_keys',count(*)=3 and coalesce(bool_and(contype='f' and convalidated and confdeltype='r'),false)
  from pg_constraint where conrelid=to_regclass('public.customer_booking_requests') and contype='f'
 union all select 'base_contains_full_payload_replay',coalesce(prosrc like '%request_payload is distinct from v_payload%' and prosrc like '%customer_booking_payload%' and prosrc like '%customer_identity_conflict%',false)
  from routines where signature='public.create_appointment_atomic(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)'
 union all select 'plain_coupon_share_request_lock',count(*)=2 and coalesce(bool_and(prosrc like '%customer-booking:%'),false)
  from routines where signature in('public.create_appointment_atomic(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)','public.create_appointment_with_coupon(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text)')
 union all select 'reschedule_window_and_discrete_slot_guard',coalesce(prosrc like '%outside_booking_window%' and prosrc like '%get_appointment_reschedule_slots%' and prosrc like '%unsupported_customer_reschedule%',false)
  from routines where signature='public.reschedule_customer_appointment(uuid,timestamptz)'
 union all select 'reschedule_keeps_booked_occupied_duration',count(*)=2 and coalesce(bool_and(prosrc like '%v_appointment.ends_at-v_appointment.starts_at%' and prosrc like '%assert_customer_booking_allowed%'),false)
  from routines where signature in('public.get_appointment_reschedule_slots(uuid,date)','public.reschedule_customer_appointment(uuid,timestamptz)')
 union all select 'owner_members_employee_covered',coalesce(prosrc like '%owner_user_id%' and prosrc like '%business_members%' and prosrc like '%employees%' and prosrc like '%and active%',false)
  from routines where signature='public.assert_customer_booking_allowed(uuid,uuid)'
)
select check_name,case when passed then 'PASS' else 'FAIL' end result from checks order by check_name;
