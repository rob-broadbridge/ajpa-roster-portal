-- Stage 11 verification: inspect the durable reminder-delivery queue.
-- A successful reminder ends in SENT. A transient error becomes PENDING and
-- shows a future next_attempt_at; FAILED is reached only after five attempts.

select
  delivery.status,
  delivery.attempt_count,
  delivery.report_start_date,
  delivery.report_end_date,
  delivery.next_attempt_at,
  delivery.sent_at,
  delivery.last_error,
  profile.full_name,
  profile.email
from public.desk_admin_reminder_deliveries as delivery
join public.profiles as profile on profile.id = delivery.profile_id
order by delivery.updated_at desc
limit 20;
