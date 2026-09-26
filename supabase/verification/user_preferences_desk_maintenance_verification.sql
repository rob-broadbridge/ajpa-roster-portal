-- Read-only verification for the Desk Maintenance preference column.
with definition as (
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_preferences'
    and column_name = 'desk_maintenance_filters'
)
select
  'desk_maintenance_filters is jsonb NOT NULL with an empty-object default' as check_name,
  coalesce((select column_name from definition), '<missing>') as column_name,
  coalesce((select data_type from definition), '<missing>') as data_type,
  coalesce((select is_nullable from definition), '<missing>') as is_nullable,
  coalesce((select column_default from definition), '<missing>') as column_default,
  case when exists (
    select 1 from definition
    where data_type = 'jsonb'
      and is_nullable = 'NO'
      and column_default = '''{}''::jsonb'
  ) then 'PASS' else 'FAIL' end as result;
