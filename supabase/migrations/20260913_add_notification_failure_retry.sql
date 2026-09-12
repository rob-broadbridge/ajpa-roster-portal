-- Stage 3B: allow a Registrar to safely return a permanently failed duty
-- email to the queue after correcting its underlying configuration problem.

create or replace function public.retry_failed_duty_notification(
  p_notification_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.status = 'Approved'
      and profiles.role = 'Registrar'
  ) then
    raise exception 'Only Registrars can retry notification failures.';
  end if;

  update public.duty_assignment_notifications
  set status = case
        -- No confirmation was successfully recorded, so retry the delayed
        -- confirmation. The processor will first check that the booking still
        -- exists before it sends anything.
        when confirmation_sent_at is null then 'PENDING_CONFIRMATION'
        -- A confirmation was already sent; the only remaining email path is
        -- the cancellation path (member cancellation and/or desk alert).
        else 'CANCELLATION_PENDING'
      end,
      next_attempt_at = now(),
      failure_count = 0,
      failed_at = null,
      processing_started_at = null,
      last_error = null,
      updated_at = now()
  where id = p_notification_id
    and status = 'FAILED'
  returning status into next_status;

  if next_status is null then
    raise exception 'This notification is no longer a failed notification.';
  end if;

  return next_status;
end;
$$;

revoke all on function public.retry_failed_duty_notification(uuid) from public, anon;
grant execute on function public.retry_failed_duty_notification(uuid) to authenticated, service_role;
