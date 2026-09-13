-- Stage 12 verification. The active schedule should be quarter-hourly.

select
  jobname,
  schedule,
  active
from cron.job
where jobname = 'ajpa-desk-admin-reminders-quarter-hourly';
