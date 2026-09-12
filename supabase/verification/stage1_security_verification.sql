-- Stage 1 verification only: safe to run in Supabase SQL Editor.
-- The first result should show false for anon and authenticated on every
-- privileged worker function, and true for service_role.

select
  p.oid::regprocedure as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_due_duty_notifications',
    'complete_duty_confirmation',
    'release_duty_notification',
    'invoke_duty_notification_processor',
    'invoke_desk_admin_reminder_check',
    'is_duty_slot_holiday'
  )
order by function_name;

-- Confirm Row Level Security is enabled on every public application table.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- Review the policy names and roles before Stage 2 introduces new database
-- procedures. Keep this output with the project deployment record.
select
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
