-- Stage 9 verification. Existing regions should all remain Pacific/Auckland.
-- The three operational functions should be present after the migration.

select name, code, timezone
from public.regions
order by name;

select
  p.proname as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anonymous_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('apply_duty_assignment_change', 'materialize_recurring_duty_assignments')
order by p.proname;
