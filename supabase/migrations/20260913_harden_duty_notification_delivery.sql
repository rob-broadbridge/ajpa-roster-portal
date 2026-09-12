-- Stage 3: durable, rate-limited duty-notification delivery.
-- A retry uses the same immutable email snapshot and Resend idempotency key.

alter table public.duty_assignment_notifications
  add column if not exists next_attempt_at timestamptz,
  add column if not exists failure_count integer not null default 0,
  add column if not exists failed_at timestamptz,
  add column if not exists payload_snapshot jsonb;

update public.duty_assignment_notifications
set next_attempt_at = coalesce(next_attempt_at, confirmation_due_at, now())
where next_attempt_at is null;

alter table public.duty_assignment_notifications
  alter column next_attempt_at set default now(),
  alter column next_attempt_at set not null;

alter table public.duty_assignment_notifications
  drop constraint if exists duty_assignment_notifications_status_check;
alter table public.duty_assignment_notifications
  add constraint duty_assignment_notifications_status_check check (status in (
    'PENDING_CONFIRMATION', 'PROCESSING_CONFIRMATION', 'CONFIRMATION_SENT',
    'CANCELLED_BEFORE_CONFIRMATION', 'CANCELLATION_PENDING',
    'PROCESSING_CANCELLATION', 'CANCELLATION_SENT', 'FAILED'
  ));

create index if not exists duty_assignment_notifications_attempt_idx
  on public.duty_assignment_notifications (status, next_attempt_at);

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
      profile_id, slot_id, duty_date, status, confirmation_due_at, next_attempt_at
    ) values (
      new.profile_id, new.slot_id, new.duty_date,
      'PENDING_CONFIRMATION', now() + interval '5 minutes', now() + interval '5 minutes'
    );
    return new;
  end if;

  select start_time, min_jps into slot_start_time, minimum_jps
  from public.duty_slots where id = old.slot_id;
  select count(*) into remaining_jps
  from public.duty_assignments where slot_id = old.slot_id and duty_date = old.duty_date;

  local_now := timezone('Pacific/Auckland', now());
  shift_starts_at := old.duty_date + coalesce(slot_start_time, time '00:00');
  alert_required := slot_start_time is not null
    and shift_starts_at > local_now
    and shift_starts_at <= local_now + interval '7 days'
    and remaining_jps < coalesce(minimum_jps, 0);

  update public.duty_assignment_notifications as notification
  set status = case
        when notification.status in ('PENDING_CONFIRMATION', 'PROCESSING_CONFIRMATION')
          then 'CANCELLED_BEFORE_CONFIRMATION'
        else 'CANCELLATION_PENDING'
      end,
      cancellation_requested_at = now(),
      desk_admin_alert_required = alert_required,
      processing_started_at = null,
      next_attempt_at = now(),
      failure_count = 0,
      failed_at = null,
      last_error = null,
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
      and notification.next_attempt_at <= now()
    ) or (
      notification.status = 'CANCELLATION_PENDING'
      and notification.next_attempt_at <= now()
    ) or (
      notification.status in ('PROCESSING_CONFIRMATION', 'PROCESSING_CANCELLATION')
      and notification.processing_started_at < now() - interval '10 minutes'
    )
    order by notification.next_attempt_at, notification.created_at
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
declare completed_status text;
begin
  update public.duty_assignment_notifications
  set status = case when status = 'CANCELLED_BEFORE_CONFIRMATION'
      then 'CANCELLATION_PENDING' else 'CONFIRMATION_SENT' end,
      confirmation_sent_at = now(),
      resend_confirmation_id = p_resend_confirmation_id,
      processing_started_at = null,
      next_attempt_at = now(),
      failure_count = 0,
      failed_at = null,
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
  set failure_count = failure_count + 1,
      status = case when failure_count + 1 >= 5 then 'FAILED'
        when status = 'PROCESSING_CONFIRMATION' then 'PENDING_CONFIRMATION'
        when status = 'PROCESSING_CANCELLATION' then 'CANCELLATION_PENDING'
        else status end,
      next_attempt_at = case when failure_count + 1 >= 5 then now()
        when failure_count + 1 = 1 then now() + interval '1 minute'
        when failure_count + 1 = 2 then now() + interval '5 minutes'
        when failure_count + 1 = 3 then now() + interval '30 minutes'
        else now() + interval '2 hours' end,
      failed_at = case when failure_count + 1 >= 5 then now() else null end,
      processing_started_at = null,
      last_error = left(coalesce(p_error, 'Unknown notification error'), 2000),
      updated_at = now()
  where id = p_notification_id;
end;
$$;

create or replace function public.get_duty_notification_failures(p_limit integer default 100)
returns table (
  id uuid,
  status text,
  failure_count integer,
  last_error text,
  duty_date date,
  updated_at timestamptz,
  member_name text,
  desk_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.status = 'Approved'
      and profiles.role = 'Registrar'
  ) then
    raise exception 'Only Registrars can view notification failures.';
  end if;

  return query
  select notification.id, notification.status, notification.failure_count,
    notification.last_error, notification.duty_date, notification.updated_at,
    profile.full_name, desk.name
  from public.duty_assignment_notifications as notification
  join public.profiles as profile on profile.id = notification.profile_id
  join public.duty_slots as slot on slot.id = notification.slot_id
  join public.service_desks as desk on desk.id = slot.desk_id
  where notification.status = 'FAILED'
  order by notification.updated_at desc
  limit least(greatest(p_limit, 1), 250);
end;
$$;

revoke all on function public.get_duty_notification_failures(integer) from public, anon;
grant execute on function public.get_duty_notification_failures(integer) to authenticated, service_role;
