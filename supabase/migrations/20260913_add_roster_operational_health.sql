-- Stage 13: Registrar-only operational health summary for scheduled roster
-- email processing. The browser receives summary counts only, not email
-- content or notification payloads.

create or replace function public.get_roster_operational_health()
returns jsonb
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  duty_failed integer;
  duty_waiting integer;
  reminder_failed integer;
  reminder_waiting integer;
  schedules jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'Approved' and role = 'Registrar'
  ) then
    raise exception 'Only Registrars can view roster operational health.';
  end if;

  select
    count(*) filter (where status = 'FAILED'),
    count(*) filter (where status in (
      'PENDING_CONFIRMATION', 'PROCESSING_CONFIRMATION',
      'CANCELLATION_PENDING', 'PROCESSING_CANCELLATION'
    ))
  into duty_failed, duty_waiting
  from public.duty_assignment_notifications;

  select
    count(*) filter (where status = 'FAILED'),
    count(*) filter (where status in ('PENDING', 'PROCESSING'))
  into reminder_failed, reminder_waiting
  from public.desk_admin_reminder_deliveries;

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
    ('ajpa-recurring-assignment-materialiser-daily')
  ) as expected(jobname)
  left join cron.job as job on job.jobname = expected.jobname
  left join lateral (
    select run.status, run.start_time, run.end_time, run.return_message
    from cron.job_run_details as run
    where run.jobid = job.jobid
    order by run.start_time desc
    limit 1
  ) as latest on true;

  return jsonb_build_object(
    'duty_notifications', jsonb_build_object('failed', coalesce(duty_failed, 0), 'waiting', coalesce(duty_waiting, 0)),
    'desk_admin_reminders', jsonb_build_object('failed', coalesce(reminder_failed, 0), 'waiting', coalesce(reminder_waiting, 0)),
    'schedules', schedules,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.get_roster_operational_health() from public, anon;
grant execute on function public.get_roster_operational_health() to authenticated, service_role;
