-- Stage 20 verification: run after the migration above.
-- Only authenticated users may run the booking procedure.
select
  has_function_privilege('anon', procedure.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', procedure.oid, 'execute') as authenticated_can_execute
from pg_proc as procedure
join pg_namespace as namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname = 'apply_duty_assignment_change';

-- Optional post-test: substitute the withdrawn historical slot. Both queries
-- should return no rows: no recurring override and no cancellation email.
-- select * from public.recurring_rules
-- where profile_id = '<member-id>' and slot_id = '<slot-id>' and start_date = '<past-date>';
-- select * from public.duty_assignment_notifications
-- where profile_id = '<member-id>' and slot_id = '<slot-id>' and duty_date = '<past-date>'
--   and status in ('CANCELLATION_PENDING', 'CANCELLATION_SENT');
