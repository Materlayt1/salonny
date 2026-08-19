-- Cover every public foreign key with a leading-column index. Besides joins, this
-- prevents parent-row updates/deletes from scanning entire child tables.
do $$
declare
  target_constraint record;
  index_name text;
begin
  for target_constraint in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      constraint_row.conname,
      constraint_row.conrelid,
      constraint_row.conkey,
      (
        select string_agg(quote_ident(attribute.attname), ', ' order by key_column.ordinality)
        from unnest(constraint_row.conkey) with ordinality key_column(attnum, ordinality)
        join pg_attribute attribute
          on attribute.attrelid = constraint_row.conrelid
         and attribute.attnum = key_column.attnum
      ) as column_list
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where constraint_row.contype = 'f'
      and namespace.nspname = 'public'
      and not exists (
        select 1
        from pg_index existing_index
        where existing_index.indrelid = constraint_row.conrelid
          and existing_index.indisvalid
          and existing_index.indisready
          and existing_index.indpred is null
          and (existing_index.indkey::smallint[])[0:cardinality(constraint_row.conkey)-1] = constraint_row.conkey
      )
  loop
    index_name := left(target_constraint.conname, 54) || '_idx';
    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      target_constraint.schema_name,
      target_constraint.table_name,
      target_constraint.column_list
    );
  end loop;
end;
$$;

