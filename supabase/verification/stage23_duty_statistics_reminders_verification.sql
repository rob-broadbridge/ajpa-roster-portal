-- Stage 23 verification: statistics reminders are queued separately from
-- booking confirmations and are processed once a minute.

select
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('duty_statistics_reminders', 'duty_statistics_reminder_settings')
order by table_name;

-- Expected: five rows.
select p.oid::regprocedure as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'materialize_due_duty_statistics_reminders',
    'claim_due_duty_statistics_reminders',
    'complete_duty_statistics_reminder',
    'release_duty_statistics_reminder',
    'get_duty_statistics_reminder_target'
  )
order by function_name;

-- Expected: one active job.
select jobname, schedule, active
from cron.job
where jobname = 'ajpa-duty-statistics-reminder-processor-minute';

-- Use after a test shift has ended. It confirms whether one reminder was
-- created for each registered JP and whether it was delivered or skipped.
select
  reminder.duty_date,
  member.full_name as jp_member,
  reminder.status,
  reminder.due_at at time zone 'Pacific/Auckland' as due_auckland,
  reminder.sent_at at time zone 'Pacific/Auckland' as sent_auckland,
  reminder.last_error
from public.duty_statistics_reminders as reminder
join public.profiles as member on member.id = reminder.profile_id
order by reminder.created_at desc
limit 25;
