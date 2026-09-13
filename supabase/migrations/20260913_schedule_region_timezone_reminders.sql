-- Stage 12: check reminders every 15 minutes. This allows a new report to be
-- created exactly at midnight in regions whose UTC offset is not a whole hour
-- (for example, Australia/Adelaide or Pacific/Chatham), and processes retry
-- queue entries promptly.

create extension if not exists pg_cron with schema extensions;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'ajpa-desk-admin-reminders-hourly'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
  for existing_job in
    select jobid from cron.job where jobname = 'ajpa-desk-admin-reminders-quarter-hourly'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'ajpa-desk-admin-reminders-quarter-hourly',
  '*/15 * * * *',
  $$select public.invoke_desk_admin_reminder_check();$$
);
