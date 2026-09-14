-- Stage 18: retain former member profiles and their audit history while
-- disabling portal access. Sign-in already requires status = 'Approved'.

do $$
declare
  status_type_kind "char";
  status_type_schema name;
  status_type_name name;
  status_constraint record;
begin
  select type.typtype, type_schema.nspname, type.typname
    into status_type_kind, status_type_schema, status_type_name
  from pg_attribute as attribute
  join pg_class as relation on relation.oid = attribute.attrelid
  join pg_namespace as relation_schema on relation_schema.oid = relation.relnamespace
  join pg_type as type on type.oid = attribute.atttypid
  join pg_namespace as type_schema on type_schema.oid = type.typnamespace
  where relation_schema.nspname = 'public'
    and relation.relname = 'profiles'
    and attribute.attname = 'status'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if status_type_kind = 'e' then
    -- Supports databases whose profile status was originally defined as an enum.
    execute format(
      'alter type %I.%I add value if not exists %L',
      status_type_schema,
      status_type_name,
      'Archived'
    );
  else
    -- Supports the text-with-CHECK-constraint schema used by the initial AJPA
    -- setup. Replace only checks that govern the status column.
    for status_constraint in
      select conname as constraint_name
      from pg_constraint
      where conrelid = 'public.profiles'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%status%'
    loop
      execute format(
        'alter table public.profiles drop constraint if exists %I',
        status_constraint.constraint_name
      );
    end loop;

    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('Pending', 'Approved', 'Rejected', 'Archived'));
  end if;
end;
$$;
