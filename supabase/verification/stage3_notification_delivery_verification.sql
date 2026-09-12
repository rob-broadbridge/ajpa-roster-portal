-- Stage 3 verification: safe to run in Supabase SQL Editor after the
-- notification delivery migration and Edge Function have been deployed.

select
  status,
  count(*) as notifications,
  max(failure_count) as highest_failure_count,
  max(next_attempt_at) as latest_next_attempt,
  count(*) filter (where payload_snapshot is not null) as snapshotted_messages
from public.duty_assignment_notifications
group by status
order by status;

select
  has_function_privilege(
    'authenticated',
    'public.get_duty_notification_failures(integer)'::regprocedure,
    'execute'
  ) as signed_in_can_request_failure_list,
  has_function_privilege(
    'anon',
    'public.get_duty_notification_failures(integer)'::regprocedure,
    'execute'
  ) as anonymous_can_request_failure_list;

-- Stage 3B: both operational functions must be inaccessible to anonymous
-- callers. The functions themselves enforce the Registrar role for signed-in
-- users.
select
  has_function_privilege(
    'authenticated',
    'public.retry_failed_duty_notification(uuid)'::regprocedure,
    'execute'
  ) as signed_in_can_request_retry,
  has_function_privilege(
    'anon',
    'public.retry_failed_duty_notification(uuid)'::regprocedure,
    'execute'
  ) as anonymous_can_request_retry;
