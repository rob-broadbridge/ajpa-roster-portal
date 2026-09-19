-- Follow-up statistics reminders and monthly Desk Admin statistics reports.

alter table public.duty_statistics_reminders
  add column if not exists reminder_kind text not null default 'INITIAL',
  add column if not exists reminder_number integer not null default 0;

alter table public.duty_statistics_reminders
  drop constraint if exists duty_statistics_reminders_profile_id_slot_id_duty_date_key;

alter table public.duty_statistics_reminders
  drop constraint if exists duty_statistics_reminders_reminder_kind_check;

alter table public.duty_statistics_reminders
  add constraint duty_statistics_reminders_reminder_kind_check
  check (reminder_kind in ('INITIAL', 'FOLLOW_UP'));

create unique index if not exists duty_statistics_reminders_occurrence_kind_key
  on public.duty_statistics_reminders (profile_id, slot_id, duty_date, reminder_kind, reminder_number);

-- In addition to the original 15-minute notification, create one follow-up
-- at day 4 and then each seven days while the Statistics remain incomplete.
-- The next reminder cannot be created until the preceding follow-up exists.
create or replace function public.materialize_due_duty_statistics_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_follow_ups_inserted integer := 0;
begin
  insert into public.duty_statistics_reminders (
    profile_id, slot_id, duty_date, due_at, next_attempt_at, reminder_kind, reminder_number
  )
  select assignment.profile_id, assignment.slot_id, assignment.duty_date,
    occurrence.ends_at + interval '15 minutes', now(), 'INITIAL', 0
  from public.duty_assignments assignment
  join public.duty_slots slot on slot.id = assignment.slot_id
  join public.service_desks desk on desk.id = slot.desk_id
  left join public.regions region on region.id = desk.region_id
  join public.profiles member on member.id = assignment.profile_id
  cross join public.duty_statistics_reminder_settings settings
  cross join lateral (
    select ((assignment.duty_date + slot.end_time) at time zone coalesce(region.timezone, 'Pacific/Auckland')) as ends_at
  ) occurrence
  where member.status = 'Approved'
    and slot.end_time is not null
    and not coalesce(desk.is_home_based_service, false)
    and occurrence.ends_at + interval '15 minutes' >= settings.enabled_at
    and occurrence.ends_at + interval '15 minutes' <= now()
    and not exists (
      select 1 from public.duty_statistics statistic
      where statistic.profile_id = assignment.profile_id and statistic.slot_id = assignment.slot_id and statistic.duty_date = assignment.duty_date
    )
  on conflict (profile_id, slot_id, duty_date, reminder_kind, reminder_number) do nothing;

  get diagnostics v_inserted = row_count;

  insert into public.duty_statistics_reminders (
    profile_id, slot_id, duty_date, due_at, next_attempt_at, reminder_kind, reminder_number
  )
  select assignment.profile_id, assignment.slot_id, assignment.duty_date,
    occurrence.ends_at + interval '4 days' + (next_follow_up.reminder_number * interval '7 days'),
    now(), 'FOLLOW_UP', next_follow_up.reminder_number
  from public.duty_assignments assignment
  join public.duty_slots slot on slot.id = assignment.slot_id
  join public.service_desks desk on desk.id = slot.desk_id
  left join public.regions region on region.id = desk.region_id
  join public.profiles member on member.id = assignment.profile_id
  cross join public.duty_statistics_reminder_settings settings
  cross join lateral (
    select ((assignment.duty_date + slot.end_time) at time zone coalesce(region.timezone, 'Pacific/Auckland')) as ends_at
  ) occurrence
  cross join lateral (
    select coalesce(max(reminder.reminder_number), -1) + 1 as reminder_number
    from public.duty_statistics_reminders reminder
    where reminder.profile_id = assignment.profile_id
      and reminder.slot_id = assignment.slot_id
      and reminder.duty_date = assignment.duty_date
      and reminder.reminder_kind = 'FOLLOW_UP'
  ) next_follow_up
  where member.status = 'Approved'
    and slot.end_time is not null
    and not coalesce(desk.is_home_based_service, false)
    and occurrence.ends_at + interval '4 days' + (next_follow_up.reminder_number * interval '7 days') >= settings.enabled_at
    and occurrence.ends_at + interval '4 days' + (next_follow_up.reminder_number * interval '7 days') <= now()
    and not exists (
      select 1 from public.duty_statistics_reminders reminder
      where reminder.profile_id = assignment.profile_id
        and reminder.slot_id = assignment.slot_id
        and reminder.duty_date = assignment.duty_date
        and reminder.reminder_kind = 'FOLLOW_UP'
        and reminder.status in ('PENDING', 'PROCESSING')
    )
    and not exists (
      select 1 from public.duty_statistics statistic
      where statistic.profile_id = assignment.profile_id and statistic.slot_id = assignment.slot_id and statistic.duty_date = assignment.duty_date
    )
  on conflict (profile_id, slot_id, duty_date, reminder_kind, reminder_number) do nothing;

  get diagnostics v_follow_ups_inserted = row_count;
  v_inserted := v_inserted + v_follow_ups_inserted;
  return v_inserted;
end;
$$;

create table if not exists public.desk_admin_monthly_statistics_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  timezone text not null,
  report_month date not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  processing_started_at timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  resend_email_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, timezone, report_month)
);

create index if not exists desk_admin_monthly_statistics_reports_due_idx
  on public.desk_admin_monthly_statistics_reports (status, next_attempt_at);
alter table public.desk_admin_monthly_statistics_reports enable row level security;
revoke all on public.desk_admin_monthly_statistics_reports from anon, authenticated;

create or replace function public.claim_desk_admin_monthly_statistics_report(p_profile_id uuid, p_timezone text, p_report_month date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.desk_admin_monthly_statistics_reports (profile_id, timezone, report_month)
  values (p_profile_id, p_timezone, p_report_month)
  on conflict (profile_id, timezone, report_month) do nothing
  returning id into v_id;
  if v_id is not null then return v_id; end if;
  update public.desk_admin_monthly_statistics_reports
  set status = 'PROCESSING', processing_started_at = now(), attempt_count = attempt_count + 1, updated_at = now()
  where profile_id = p_profile_id and timezone = p_timezone and report_month = p_report_month
    and ((status = 'PENDING' and next_attempt_at <= now()) or (status = 'PROCESSING' and processing_started_at < now() - interval '15 minutes'))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.complete_desk_admin_monthly_statistics_report(p_report_id uuid, p_resend_email_id text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.desk_admin_monthly_statistics_reports
  set status = 'SENT', sent_at = now(), resend_email_id = p_resend_email_id, processing_started_at = null, last_error = null, updated_at = now()
  where id = p_report_id and status = 'PROCESSING';
end;
$$;

create or replace function public.release_desk_admin_monthly_statistics_report(p_report_id uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.desk_admin_monthly_statistics_reports
  set status = case when attempt_count >= 5 then 'FAILED' else 'PENDING' end,
      next_attempt_at = case when attempt_count >= 5 then now() when attempt_count = 1 then now() + interval '1 minute' when attempt_count = 2 then now() + interval '5 minutes' when attempt_count = 3 then now() + interval '30 minutes' else now() + interval '2 hours' end,
      processing_started_at = null, last_error = left(coalesce(p_error, 'Unknown monthly Statistics report error'), 2000), updated_at = now()
  where id = p_report_id and status = 'PROCESSING';
end;
$$;

revoke all on function public.claim_desk_admin_monthly_statistics_report(uuid, text, date) from public, anon, authenticated;
revoke all on function public.complete_desk_admin_monthly_statistics_report(uuid, text) from public, anon, authenticated;
revoke all on function public.release_desk_admin_monthly_statistics_report(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_desk_admin_monthly_statistics_report(uuid, text, date) to service_role;
grant execute on function public.complete_desk_admin_monthly_statistics_report(uuid, text) to service_role;
grant execute on function public.release_desk_admin_monthly_statistics_report(uuid, text) to service_role;

create or replace function public.invoke_monthly_duty_statistics_report_processor()
returns void language plpgsql security definer set search_path = public, vault, net as $$
declare webhook_secret text;
begin
  select decrypted_secret into webhook_secret from vault.decrypted_secrets where name = 'registrar_webhook_secret' limit 1;
  if webhook_secret is null then raise exception 'Vault secret registrar_webhook_secret was not found.'; end if;
  perform net.http_post(
    url := 'https://pdffmqafznvrblxxptvf.supabase.co/functions/v1/process-monthly-duty-statistics-reports',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := '{}'::jsonb
  );
end;
$$;

do $$
declare existing_job record;
begin
  for existing_job in select jobid from cron.job where jobname = 'ajpa-monthly-duty-statistics-report-processor-minute'
  loop perform cron.unschedule(existing_job.jobid); end loop;
end;
$$;

select cron.schedule('ajpa-monthly-duty-statistics-report-processor-minute', '* * * * *', $$select public.invoke_monthly_duty_statistics_report_processor();$$);
