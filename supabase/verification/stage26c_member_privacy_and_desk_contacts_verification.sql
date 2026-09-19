-- Stage 2C verification. Run each block separately in Supabase SQL Editor.

-- Block 1: expected rows are registrar_manage_profiles and
-- own_or_registrar_read_profiles. authenticated read profiles must not appear.
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;

-- Block 2: expected values are false / true / true for both functions.
select
  p.oid::regprocedure as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_roster_member_directory_for_current_user',
    'get_desk_follower_contacts_for_current_user'
  )
order by function_name;

-- Block 3: expected one row, confirming the follower-report lookup index.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'desk_follows'
  and indexname = 'desk_follows_desk_profile_idx';
