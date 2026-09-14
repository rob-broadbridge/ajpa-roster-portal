-- Stage 19 verification: run after the migration above.
select
  has_function_privilege('anon', procedure.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', procedure.oid, 'execute') as authenticated_can_execute
from pg_proc as procedure
join pg_namespace as namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname = 'apply_duty_assignment_change';

-- Optional post-test: substitute a past registration's ids and date. No row
-- should be returned because past registrations do not queue duty emails.
-- select * from public.duty_assignment_notifications
-- where profile_id = '<member-id>' and slot_id = '<slot-id>' and duty_date = '<past-date>';
