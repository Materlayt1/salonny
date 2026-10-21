-- Read-only drift check. MD5 is not an authenticity/security primitive here.
with expected(name,hash) as (values
  ('business_owner_lifecycle_blocked','80f4c6dabe343a4b44d23b84944a48ce'),
  ('lock_business_owner_lifecycle','e3325cee5837901b59234543344ae466'),
  ('guard_business_owner_lifecycle','0d177060a1645847a63afbb7def7bcb9'),
  ('withdraw_owner_businesses','aa7dc345d3e9989cdc5e0d6133815346'),
  ('guard_account_deletion_lifecycle','8afb73df6bb5fc9c0155bbf8dcc8cbfc'),
  ('apply_account_deletion_lifecycle','631598d10e6f3d129a29862bc88b4122'),
  ('guard_user_deletion_lifecycle','ec4eb99ce2d2af43429b2d8fae809701'),
  ('apply_user_deletion_lifecycle','228dfb305f16d2d99e94762333f8d7f2'),
  ('request_account_deletion','34996937a5a5a6c5cacfff3a6a081f34')
), checks as (
  select e.name check_name,coalesce(md5(regexp_replace(replace(p.prosrc,chr(13),''),'^[[:space:]]+|[[:space:]]+$','','g'))=e.hash,false) passed
    from expected e left join pg_proc p on p.proname=e.name and p.pronamespace='public'::regnamespace
  union all
  select 'migration_source',count(*)=1 and bool_and(name='account_deletion_publication_lifecycle' and cardinality(statements)=1 and md5(replace(statements[1],chr(13),''))='0a9978883c9abe583e1961cf6a454985')
    from supabase_migrations.schema_migrations where version='202610210042'
)
select check_name,case when passed then 'PASS' else 'FAIL' end result from checks order by check_name;
