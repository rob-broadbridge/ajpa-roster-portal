-- Stage 8: make Desk Admin reminder delivery durable and idempotent.
-- A scheduled invocation, manual test, or retry can never send the same
-- reporting-period email twice. Individual delivery failures are retried
-- without preventing reports for other Desk Admins.

create table if not exists public.desk_admin_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  timezone text not null,
  report_start_date date not null,
  report_end_date date not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  resend_email_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, timezone, report_start_date, report_end_date)
);

create index if not exists desk_admin_reminder_deliveries_due_idx
  on public.desk_admin_reminder_deliveries (status, next_attempt_at);

alter table public.desk_admin_reminder_deliveries enable row level security;
revoke all on public.desk_admin_reminder_deliveries from anon, authenticated;

create or replace function public.claim_desk_admin_reminder_delivery(
  p_profile_id uuid,
  p_timezone text,
  p_report_start_date date,
  p_report_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_id uuid;
begin
  insert into public.desk_admin_reminder_deliveries (
    profile_id, timezone, report_start_date, report_end_date, status, processing_started_at, attempt_count
  ) values (
    p_profile_id, p_timezone, p_report_start_date, p_report_end_date, 'PROCESSING', now(), 1
  )
  on conflict (profile_id, timezone, report_start_date, report_end_date) do update
  set status = 'PROCESSING',
      processing_started_at = now(),
      attempt_count = desk_admin_reminder_deliveries.attempt_count + 1,
      updated_at = now()
  where (
    desk_admin_reminder_deliveries.status = 'PENDING'
    and desk_admin_reminder_deliveries.next_attempt_at <= now()
  ) or (
    desk_admin_reminder_deliveries.status = 'PROCESSING'
    and desk_admin_reminder_deliveries.processing_started_at < now() - interval '15 minutes'
  )
  returning id into delivery_id;

  return delivery_id;
end;
$$;

create or replace function public.complete_desk_admin_reminder_delivery(
  p_delivery_id uuid,
  p_resend_email_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.desk_admin_reminder_deliveries
  set status = 'SENT',
      sent_at = now(),
      resend_email_id = p_resend_email_id,
      processing_started_at = null,
      last_error = null,
      updated_at = now()
  where id = p_delivery_id and status = 'PROCESSING';
end;
$$;

create or replace function public.release_desk_admin_reminder_delivery(
  p_delivery_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.desk_admin_reminder_deliveries
  set status = case when attempt_count >= 5 then 'FAILED' else 'PENDING' end,
      next_attempt_at = case
        when attempt_count >= 5 then now()
        when attempt_count = 1 then now() + interval '5 minutes'
        when attempt_count = 2 then now() + interval '30 minutes'
        else now() + interval '2 hours'
      end,
      processing_started_at = null,
      last_error = left(coalesce(p_error, 'Unknown reminder delivery error'), 2000),
      updated_at = now()
  where id = p_delivery_id and status = 'PROCESSING';
end;
$$;

revoke all on function public.claim_desk_admin_reminder_delivery(uuid, text, date, date) from public, anon, authenticated;
revoke all on function public.complete_desk_admin_reminder_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.release_desk_admin_reminder_delivery(uuid, text) from public, anon, authenticated;

grant execute on function public.claim_desk_admin_reminder_delivery(uuid, text, date, date) to service_role;
grant execute on function public.complete_desk_admin_reminder_delivery(uuid, text) to service_role;
grant execute on function public.release_desk_admin_reminder_delivery(uuid, text) to service_role;
