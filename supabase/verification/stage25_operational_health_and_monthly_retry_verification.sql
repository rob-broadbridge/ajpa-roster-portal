-- Expect the function and both Statistics processes to be present.
select p.oid::regprocedure as function_name,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_roster_operational_health';

select jobname, schedule, active
from cron.job
where jobname in (
  'ajpa-duty-statistics-reminder-processor-minute',
  'ajpa-monthly-duty-statistics-report-processor-minute'
)
order by jobname;

-- A failed or pending month-end email remains visible here and is retried by
-- the worker even after the 10 pm scheduling hour has passed.
select status, count(*) as reports
from public.desk_admin_monthly_statistics_reports
group by status
order by status;
