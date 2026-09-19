-- Both tables should have RLS enabled.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('duty_statistics_reminders', 'desk_admin_monthly_statistics_reports')
order by c.relname;

-- Five rows are expected.
select p.proname as function_name
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'materialize_due_duty_statistics_reminders',
    'claim_desk_admin_monthly_statistics_report',
    'complete_desk_admin_monthly_statistics_report',
    'release_desk_admin_monthly_statistics_report',
    'invoke_monthly_duty_statistics_report_processor'
  )
order by p.proname;

-- Both scheduled jobs should be active.
select jobname, schedule, active
from cron.job
where jobname in (
  'ajpa-duty-statistics-reminder-processor-minute',
  'ajpa-monthly-duty-statistics-report-processor-minute'
)
order by jobname;

select reminder_kind, reminder_number, status, due_at, sent_at, last_error
from public.duty_statistics_reminders
order by created_at desc
limit 25;

select report_month, timezone, status, attempt_count, sent_at, last_error
from public.desk_admin_monthly_statistics_reports
order by created_at desc
limit 25;
