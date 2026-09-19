-- Send one statistics reminder to each JP, 15 minutes after a rostered duty
-- ends.  This is deliberately a separate queue from booking confirmations so
-- a confirmation or cancellation problem cannot block a statistics reminder.

alter table public.service_desks
  add column if not exists is_home_based_service boolean not null default false;

create table if not exists public.duty_statistics_reminders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  slot_id uuid not null references public.duty_slots(id) on delete cascade,
  duty_date date not null,
  due_at timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SENT', 'SKIPPED', 'FAILED')),
  access_token text unique,
  token_expires_at timestamptz,
  processing_started_at timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  resend_email_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, slot_id, duty_date)
);

create index if not exists duty_statistics_reminders_due_idx
  on public.duty_statistics_reminders (status, due_at, next_attempt_at);

alter table public.duty_statistics_reminders enable row level security;
revoke all on public.duty_statistics_reminders from anon, authenticated;

-- The rollout marker prevents a new deployment from emailing JPs about old,
-- historic shifts that did not have this reminder service at the time.
create table if not exists public.duty_statistics_reminder_settings (
  id boolean primary key default true check (id),
  enabled_at timestamptz not null default now()
);

insert into public.duty_statistics_reminder_settings (id)
values (true)
on conflict (id) do nothing;

create or replace function public.materialize_due_duty_statistics_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  insert into public.duty_statistics_reminders (
    profile_id, slot_id, duty_date, due_at, next_attempt_at
  )
  select
    assignment.profile_id,
    assignment.slot_id,
    assignment.duty_date,
    ((assignment.duty_date + slot.end_time) at time zone coalesce(region.timezone, 'Pacific/Auckland')) + interval '15 minutes',
    now()
  from public.duty_assignments as assignment
  join public.duty_slots as slot on slot.id = assignment.slot_id
  join public.service_desks as desk on desk.id = slot.desk_id
  left join public.regions as region on region.id = desk.region_id
  join public.profiles as member on member.id = assignment.profile_id
  cross join public.duty_statistics_reminder_settings as settings
  where member.status = 'Approved'
    and slot.end_time is not null
    and not coalesce(desk.is_home_based_service, false)
    and ((assignment.duty_date + slot.end_time) at time zone coalesce(region.timezone, 'Pacific/Auckland')) + interval '15 minutes' >= settings.enabled_at
    and ((assignment.duty_date + slot.end_time) at time zone coalesce(region.timezone, 'Pacific/Auckland')) + interval '15 minutes' <= now()
    and not exists (
      select 1 from public.duty_statistics as statistic
      where statistic.profile_id = assignment.profile_id
        and statistic.slot_id = assignment.slot_id
        and statistic.duty_date = assignment.duty_date
    )
  on conflict (profile_id, slot_id, duty_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.claim_due_duty_statistics_reminders(p_limit integer default 25)
returns setof public.duty_statistics_reminders
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select reminder.id
    from public.duty_statistics_reminders as reminder
    where (reminder.status = 'PENDING' and reminder.due_at <= now() and reminder.next_attempt_at <= now())
       or (reminder.status = 'PROCESSING' and reminder.processing_started_at < now() - interval '10 minutes')
    order by reminder.due_at, reminder.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  update public.duty_statistics_reminders as reminder
  set status = 'PROCESSING',
      processing_started_at = now(),
      attempt_count = reminder.attempt_count + 1,
      updated_at = now()
  from candidates
  where reminder.id = candidates.id
  returning reminder.*;
end;
$$;

create or replace function public.complete_duty_statistics_reminder(
  p_reminder_id uuid,
  p_resend_email_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.duty_statistics_reminders
  set status = 'SENT',
      sent_at = now(),
      resend_email_id = p_resend_email_id,
      processing_started_at = null,
      last_error = null,
      updated_at = now()
  where id = p_reminder_id and status = 'PROCESSING';
end;
$$;

create or replace function public.skip_duty_statistics_reminder(
  p_reminder_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.duty_statistics_reminders
  set status = 'SKIPPED',
      processing_started_at = null,
      last_error = left(coalesce(p_reason, 'No reminder required'), 500),
      updated_at = now()
  where id = p_reminder_id and status = 'PROCESSING';
end;
$$;

-- The explicit retry implementation is kept separate from delivery so failed
-- Resend calls are retried with a capped backoff and never duplicate a send.
create or replace function public.release_duty_statistics_reminder(
  p_reminder_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.duty_statistics_reminders
  set status = case
        when attempt_count >= 5 then 'FAILED'
        else 'PENDING'
      end,
      next_attempt_at = case
        when attempt_count >= 5 then now()
        when attempt_count = 1 then now() + interval '1 minute'
        when attempt_count = 2 then now() + interval '5 minutes'
        when attempt_count = 3 then now() + interval '30 minutes'
        else now() + interval '2 hours'
      end,
      processing_started_at = null,
      last_error = left(coalesce(p_error, 'Unknown statistics reminder error'), 2000),
      updated_at = now()
  where id = p_reminder_id and status = 'PROCESSING';
end;
$$;

create or replace function public.get_duty_statistics_reminder_target(p_access_token text)
returns table (slot_id uuid, duty_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
begin
  if v_profile_id is null then
    raise exception 'Please sign in to open this statistics reminder.';
  end if;

  return query
  select reminder.slot_id, reminder.duty_date
  from public.duty_statistics_reminders as reminder
  join public.duty_assignments as assignment
    on assignment.profile_id = reminder.profile_id
   and assignment.slot_id = reminder.slot_id
   and assignment.duty_date = reminder.duty_date
  join public.duty_slots as slot on slot.id = reminder.slot_id
  join public.service_desks as desk on desk.id = slot.desk_id
  join public.profiles as member on member.id = reminder.profile_id
  where reminder.access_token = p_access_token
    and reminder.profile_id = v_profile_id
    and reminder.status = 'SENT'
    and reminder.token_expires_at > now()
    and member.status = 'Approved'
    and not coalesce(desk.is_home_based_service, false)
    and not exists (
      select 1 from public.duty_statistics as statistic
      where statistic.profile_id = reminder.profile_id
        and statistic.slot_id = reminder.slot_id
        and statistic.duty_date = reminder.duty_date
    );
end;
$$;

revoke all on function public.materialize_due_duty_statistics_reminders() from public, anon, authenticated;
revoke all on function public.claim_due_duty_statistics_reminders(integer) from public, anon, authenticated;
revoke all on function public.complete_duty_statistics_reminder(uuid, text) from public, anon, authenticated;
revoke all on function public.skip_duty_statistics_reminder(uuid, text) from public, anon, authenticated;
revoke all on function public.release_duty_statistics_reminder(uuid, text) from public, anon, authenticated;
revoke all on function public.get_duty_statistics_reminder_target(text) from public, anon;
grant execute on function public.materialize_due_duty_statistics_reminders() to service_role;
grant execute on function public.claim_due_duty_statistics_reminders(integer) to service_role;
grant execute on function public.complete_duty_statistics_reminder(uuid, text) to service_role;
grant execute on function public.skip_duty_statistics_reminder(uuid, text) to service_role;
grant execute on function public.release_duty_statistics_reminder(uuid, text) to service_role;
grant execute on function public.get_duty_statistics_reminder_target(text) to authenticated;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_duty_statistics_reminder_processor()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'registrar_webhook_secret'
  limit 1;

  if webhook_secret is null then
    raise exception 'Vault secret registrar_webhook_secret was not found.';
  end if;

  perform net.http_post(
    url := 'https://pdffmqafznvrblxxptvf.supabase.co/functions/v1/process-duty-statistics-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object('limit', 25)
  );
end;
$$;

do $$
declare existing_job record;
begin
  for existing_job in select jobid from cron.job where jobname = 'ajpa-duty-statistics-reminder-processor-minute'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'ajpa-duty-statistics-reminder-processor-minute',
  '* * * * *',
  $$select public.invoke_duty_statistics_reminder_processor();$$
);
