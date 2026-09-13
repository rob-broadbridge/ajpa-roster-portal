-- Stage 8 verification: run after the Stage 8 migration.
-- All three worker functions should be unavailable to browser roles and
-- available to service_role. The table should have RLS enabled.

select
  p.proname as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anonymous_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_desk_admin_reminder_delivery',
    'complete_desk_admin_reminder_delivery',
    'release_desk_admin_reminder_delivery'
  )
order by p.proname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'desk_admin_reminder_deliveries';
