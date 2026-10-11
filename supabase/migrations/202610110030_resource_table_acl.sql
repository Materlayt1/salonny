-- Close leftover default table/column grants after native waitlist/resources.
-- REVOKE ALL includes TRUNCATE, REFERENCES, TRIGGER and PostgreSQL 17 MAINTAIN,
-- not only the CRUD privileges addressed by the earlier migrations.
-- Authenticated reads still use the existing RLS policies, left unchanged.
-- Scoped SECURITY DEFINER RPCs/triggers retain their owner privileges; their
-- EXECUTE ACLs, the sealed request ledger, and all stored rows stay unchanged.
begin;

revoke all privileges on table public.waitlist_entries,public.business_resources,public.service_resources,public.appointment_resource_reservations from public,anon,authenticated;

-- A table-level revoke does not remove separately granted column privileges.
-- Revoke every grantable column privilege, including anonymous SELECT, before
-- restoring one authenticated table-level SELECT. Table names are a fixed
-- allow-list; catalog identifiers are quoted, never interpolated as raw input.
do $$
declare v_table text; v_columns text;
begin
  foreach v_table in array array['waitlist_entries','business_resources','service_resources','appointment_resource_reservations'] loop
    select string_agg(format('%I',a.attname),',' order by a.attnum) into v_columns
    from pg_catalog.pg_attribute a
    where a.attrelid=format('public.%I',v_table)::regclass and a.attnum>0 and not a.attisdropped;
    if v_columns is null then raise exception 'protected_table_columns_missing: %',v_table using errcode='42703'; end if;
    execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on table public.%2$I from public,anon,authenticated',v_columns,v_table);
  end loop;
end $$;

grant select on table public.waitlist_entries,public.business_resources,public.service_resources,public.appointment_resource_reservations to authenticated;

notify pgrst,'reload schema';
commit;
