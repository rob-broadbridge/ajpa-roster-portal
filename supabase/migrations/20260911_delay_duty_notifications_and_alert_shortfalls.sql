-- Queue duty emails instead of sending them immediately.  A registration is
-- confirmed only after it has remained active for five minutes.  This avoids
-- unnecessary calendar emails when a member promptly corrects a booking.

create table if not exists public.duty_assignment_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  slot_id uuid not null references public.duty_slots(id) on delete cascade,
  duty_date date not null,
  status text not null default 'PENDING_CONFIRMATION' check (status in (
    'PENDING_CONFIRMATION', 'PROCESSING_CONFIRMATION', 'CONFIRMATION_SENT',
    'CANCELLED_BEFORE_CONFIRMATION', 'CANCELLATION_PENDING',
    'PROCESSING_CANCELLATION', 'CANCELLATION_SENT'
  )),
  confirmation_due_at timestamptz not null default (now() + interval '5 minutes'),
  confirmation_sent_at timestamptz,
  cancellation_requested_at timestamptz,
  member_cancellation_sent_at timestamptz,
  desk_admin_alert_sent_at timestamptz,
  desk_admin_alert_required boolean not null default false,
  processing_started_at timestamptz,
  attempt_count integer not null default 0,
  resend_confirmation_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists duty_assignment_notifications_due_idx
  on public.duty_assignment_notifications (status, confirmation_due_at);
create index if not exists duty_assignment_notifications_occurrence_idx
  on public.duty_assignment_notifications (profile_id, slot_id, duty_date, created_at desc);

alter table public.duty_assignment_notifications enable row level security;
revoke all on public.duty_assignment_notifications from anon, authenticated;

-- The old trigger sent an email as soon as a row was inserted.  Profiles and
-- sign-up notifications continue to use notify-registrars; only duty email
-- delivery is moved to the dedicated scheduled worker below.
drop trigger if exists send_calendar_invite_on_duty_assignment on public.duty_assignments;

create or replace function public.queue_duty_assignment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_start_time time;
  minimum_jps integer;
  remaining_jps integer;
  local_now timestamp;
  shift_starts_at timestamp;
  alert_required boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into public.duty_assignment_notifications (
      profile_id, slot_id, duty_date, status, confirmation_due_at
    ) values (
      new.profile_id, new.slot_id, new.duty_date, 'PENDING_CONFIRMATION', now() + interval '5 minutes'
    );
    return new;
  end if;

  -- After a deletion, calculate staffing from the remaining assignments.  The
  -- date/time comparison uses Auckland local time, including daylight saving.
  select start_time, min_jps
    into slot_start_time, minimum_jps
  from public.duty_slots
  where id = old.slot_id;

  select count(*)
    into remaining_jps
  from public.duty_assignments
  where slot_id = old.slot_id and duty_date = old.duty_date;

  local_now := timezone('Pacific/Auckland', now());
  shift_starts_at := old.duty_date + coalesce(slot_start_time, time '00:00');
  alert_required := slot_start_time is not null
    and shift_starts_at > local_now
    and shift_starts_at <= local_now + interval '7 days'
    and remaining_jps < coalesce(minimum_jps, 0);

  -- The latest still-active notification represents the assignment being
  -- removed.  This also handles a withdrawal followed by re-registration.
  update public.duty_assignment_notifications as notification
  set status = case
        when notification.status in ('PENDING_CONFIRMATION', 'PROCESSING_CONFIRMATION')
          then 'CANCELLED_BEFORE_CONFIRMATION'
        else 'CANCELLATION_PENDING'
      end,
      cancellation_requested_at = now(),
      desk_admin_alert_required = alert_required,
      processing_started_at = null,
      updated_at = now()
  where notification.id = (
    select candidate.id
    from public.duty_assignment_notifications as candidate
    where candidate.profile_id = old.profile_id
      and candidate.slot_id = old.slot_id
      and candidate.duty_date = old.duty_date
      and candidate.status in ('PENDING_CONFIRMATION', 'PROCESSING_CONFIRMATION', 'CONFIRMATION_SENT')
    order by candidate.created_at desc
    limit 1
  );

  return old;
end;
$$;

drop trigger if exists queue_duty_assignment_notification on public.duty_assignments;
create trigger queue_duty_assignment_notification
after insert or delete on public.duty_assignments
for each row execute function public.queue_duty_assignment_notification();

-- Claim work atomically.  A stale in-progress row is safe to retry because
-- the Edge Function uses Resend idempotency keys for every email request.
create or replace function public.claim_due_duty_notifications(p_limit integer default 25)
returns setof public.duty_assignment_notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select notification.id, notification.status
    from public.duty_assignment_notifications as notification
    where (
      notification.status = 'PENDING_CONFIRMATION'
      and notification.confirmation_due_at <= now()
    ) or (
      notification.status = 'CANCELLATION_PENDING'
    ) or (
      notification.status in ('PROCESSING_CONFIRMATION', 'PROCESSING_CANCELLATION')
      and notification.processing_started_at < now() - interval '5 minutes'
    )
    order by notification.confirmation_due_at, notification.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  update public.duty_assignment_notifications as notification
  set status = case
        when candidates.status in ('CANCELLATION_PENDING', 'PROCESSING_CANCELLATION')
          then 'PROCESSING_CANCELLATION'
        else 'PROCESSING_CONFIRMATION'
      end,
      processing_started_at = now(),
      attempt_count = notification.attempt_count + 1,
      updated_at = now()
  from candidates
  where notification.id = candidates.id
  returning notification.*;
end;
$$;

create or replace function public.complete_duty_confirmation(
  p_notification_id uuid,
  p_resend_confirmation_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_status text;
begin
  update public.duty_assignment_notifications
  set status = case when status = 'CANCELLED_BEFORE_CONFIRMATION'
      then 'CANCELLATION_PENDING' else 'CONFIRMATION_SENT' end,
      confirmation_sent_at = now(),
      resend_confirmation_id = p_resend_confirmation_id,
      processing_started_at = null,
      last_error = null,
      updated_at = now()
  where id = p_notification_id
    and status in ('PROCESSING_CONFIRMATION', 'CANCELLED_BEFORE_CONFIRMATION')
  returning status into completed_status;

  return completed_status;
end;
$$;

create or replace function public.release_duty_notification(
  p_notification_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.duty_assignment_notifications
  set status = case
        when status = 'PROCESSING_CONFIRMATION' then 'PENDING_CONFIRMATION'
        when status = 'PROCESSING_CANCELLATION' then 'CANCELLATION_PENDING'
        else status
      end,
      processing_started_at = null,
      last_error = left(coalesce(p_error, 'Unknown notification error'), 2000),
      updated_at = now()
  where id = p_notification_id;
end;
$$;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_duty_notification_processor()
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
    url := 'https://pdffmqafznvrblxxptvf.supabase.co/functions/v1/process-duty-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object('limit', 25)
  );
end;
$$;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'ajpa-duty-notification-processor-minute'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'ajpa-duty-notification-processor-minute',
  '* * * * *',
  $$select public.invoke_duty_notification_processor();$$
);
