-- Stage 1 reliability: expose all email workers to Registrars and ensure a
-- failed month-end report can retry after the 10 pm scheduling window.

create or replace function public.get_roster_operational_health()
returns jsonb
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  duty_failed integer;
  duty_waiting integer;
  desk_failed integer;
  desk_waiting integer;
  statistics_failed integer;
  statistics_waiting integer;
  monthly_failed integer;
  monthly_waiting integer;
  schedules jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'Approved' and role = 'Registrar'
  ) then
    raise exception 'Only Registrars can view roster operational health.';
  end if;

  select count(*) filter (where status = 'FAILED'),
         count(*) filter (where status in ('PENDING_CONFIRMATION', 'PROCESSING_CONFIRMATION', 'CANCELLATION_PENDING', 'PROCESSING_CANCELLATION'))
  into duty_failed, duty_waiting
  from public.duty_assignment_notifications;

  select count(*) filter (where status = 'FAILED'),
         count(*) filter (where status in ('PENDING', 'PROCESSING'))
  into desk_failed, desk_waiting
  from public.desk_admin_reminder_deliveries;

  select count(*) filter (where status = 'FAILED'),
         count(*) filter (where status in ('PENDING', 'PROCESSING'))
  into statistics_failed, statistics_waiting
  from public.duty_statistics_reminders;

  select count(*) filter (where status = 'FAILED'),
         count(*) filter (where status in ('PENDING', 'PROCESSING'))
  into monthly_failed, monthly_waiting
  from public.desk_admin_monthly_statistics_reports;

  select coalesce(jsonb_object_agg(expected.jobname, jsonb_build_object(
    'schedule', job.schedule,
    'active', coalesce(job.active, false),
    'last_status', latest.status,
    'last_started_at', latest.start_time,
    'last_finished_at', latest.end_time,
    'last_message', latest.return_message
  )), '{}'::jsonb)
  into schedules
  from (values
    ('ajpa-duty-notification-processor-minute'),
    ('ajpa-desk-admin-reminders-quarter-hourly'),
    ('ajpa-recurring-assignment-materialiser-daily'),
    ('ajpa-duty-statistics-reminder-processor-minute'),
    ('ajpa-monthly-duty-statistics-report-processor-minute')
  ) as expected(jobname)
  left join cron.job job on job.jobname = expected.jobname
  left join lateral (
    select run.status, run.start_time, run.end_time, run.return_message
    from cron.job_run_details run
    where run.jobid = job.jobid
    order by run.start_time desc
    limit 1
  ) latest on true;

  return jsonb_build_object(
    'duty_notifications', jsonb_build_object('failed', coalesce(duty_failed, 0), 'waiting', coalesce(duty_waiting, 0)),
    'desk_admin_reminders', jsonb_build_object('failed', coalesce(desk_failed, 0), 'waiting', coalesce(desk_waiting, 0)),
    'statistics_reminders', jsonb_build_object('failed', coalesce(statistics_failed, 0), 'waiting', coalesce(statistics_waiting, 0)),
    'monthly_statistics_reports', jsonb_build_object('failed', coalesce(monthly_failed, 0), 'waiting', coalesce(monthly_waiting, 0)),
    'schedules', schedules,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.get_roster_operational_health() from public, anon;
grant execute on function public.get_roster_operational_health() to authenticated, service_role;
