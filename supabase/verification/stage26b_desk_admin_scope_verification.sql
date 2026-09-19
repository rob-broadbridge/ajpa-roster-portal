-- Stage 2B verification. Run each block separately in Supabase SQL Editor.

-- Block 1: expected result is no rows.  Broad is_manager()-based write
-- policies have been replaced with named, scoped policies.
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and policyname in (
    'manager manage profiles', 'manager manage regions', 'manager manage desks',
    'manager manage slots', 'manager manage cancellations',
    'own withdraw assignment', 'own edit statistics', 'read statistics', 'own rules',
    'duty_slot_holiday_overrides_admin_write'
  )
order by tablename, policyname;

-- Block 2: expected result is the ten scoped policies listed below.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and policyname in (
    'registrar_manage_profiles', 'registrar_manage_regions',
    'registrar_or_assigned_admin_manage_desks',
    'registrar_or_assigned_admin_manage_slots',
    'registrar_or_assigned_admin_manage_holiday_overrides',
    'own_or_registrar_withdraw_assignment', 'registrar_manage_cancellations',
    'own_or_registrar_edit_statistics',
    'own_registrar_or_assigned_admin_read_statistics',
    'own_or_registrar_manage_rules'
  )
order by tablename, policyname;

-- Block 3: expected values are false / true / true for all three helpers.
select
  p.oid::regprocedure as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_approved_registrar', 'is_assigned_desk_admin',
    'is_registrar_or_assigned_desk_admin'
  )
order by function_name;
