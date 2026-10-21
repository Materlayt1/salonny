-- Read-only source acceptance for the exact repository migrations 031/032.
-- Expected: 14 PASS rows (12 function bodies and 2 migration-history sources).
-- Function bodies normalize CR characters and leading/trailing whitespace.
-- History must contain the exact full migration source, normalized CRLF -> LF,
-- as ONE statements entry; its edge whitespace is deliberately not stripped.
-- MD5 is a deployment-drift check, not a cryptographic authenticity guarantee.
-- No business RPC, customer data, privilege change or application write occurs.
with expected_functions(signature,body_md5) as (values
  ('public.parse_employee_schedule_period(jsonb,boolean)','ce73daf869e09d68e155749e8e61040c'),
  ('public.employee_schedule_dates_overlap(smallint,date,date,date,date)','bcb4afa5ee5507f5e7ac6556163d7a9d'),
  ('public.manage_employee_schedule_period(uuid,uuid,uuid,text,uuid,jsonb,jsonb)','f7d76914d46de889df4b0c1ef4c41936'),
  ('public.set_employee_branch_assignment(uuid,uuid,uuid,boolean,boolean)','999795a3b5987e06d3ce5c42eeb5d1dc'),
  ('public.guard_employee_branch_assignment()','d177f3c48ffee44e7d4810947cd054a3'),
  ('public.guard_staff_assignment_parent_scope()','56088a00738ce518b909707a30f59688'),
  ('public.guard_appointment_employee_assignment()','8a9c4dc69cf17ec3877d154c86d08c72'),
  ('public.save_employee_weekly_schedule(uuid,uuid,jsonb)','024bf25e3bc7dcdb90c36fe1d22307a2'),
  ('public.native_staff_schedules_ready(uuid)','771a70520262f44ba6b405e20ef2a2a9'),
  ('public.list_business_coupons(uuid)','b153328bc8740a3c57928e318687c1e3'),
  ('public.quote_customer_coupon(uuid,uuid,uuid,uuid,text)','a1eb2a6ba0b2161be82610924d4f3a48'),
  ('public.create_appointment_with_coupon(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text)','6c0dd7bb7b664830814b6212823b58f5')
), expected_migrations(version,name,source_md5) as (values
  ('202610110031','native_staff_schedules','e56e8f29beb0a1f4a68d8abf5d919244'),
  ('202610110032','customer_coupons','f21387618ee032cacf8974c1113bbe2c')
), checks(check_name,passed) as (
  select 'function_source: '||e.signature,
    p.oid is not null and md5(regexp_replace(replace(p.prosrc,chr(13),''),
      '^[[:space:]]+|[[:space:]]+$','','g'))=e.body_md5
  from expected_functions e
  left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
  union all
  select 'migration_source: '||e.version||'_'||e.name,
    m.version is not null and m.name=e.name and cardinality(m.statements)=1
      and md5(replace(m.statements[1],chr(13),''))=e.source_md5
  from expected_migrations e
  left join supabase_migrations.schema_migrations m on m.version=e.version
)
select check_name,case when passed then 'PASS' else 'FAIL' end result
from checks order by check_name;
