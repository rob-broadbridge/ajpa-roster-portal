-- Stage 1: prevent browser roles from invoking privileged worker functions.
--
-- These functions either read a Vault secret, send an HTTP request, or change
-- notification queue rows. They are called only by pg_cron or a trusted Edge
-- Function using the Supabase service-role key; they must never be callable
-- through the public browser API.

begin;

-- Keep the normal signed-in holiday check available to the portal, but do not
-- leave PostgreSQL's default PUBLIC execute privilege in place.
revoke all on function public.is_duty_slot_holiday(uuid, date) from public, anon;
grant execute on function public.is_duty_slot_holiday(uuid, date) to authenticated;
grant execute on function public.is_duty_slot_holiday(uuid, date) to service_role;

-- Duty-email queue worker: Edge Function only.
revoke all on function public.claim_due_duty_notifications(integer)
  from public, anon, authenticated;
revoke all on function public.complete_duty_confirmation(uuid, text)
  from public, anon, authenticated;
revoke all on function public.release_duty_notification(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_due_duty_notifications(integer) to service_role;
grant execute on function public.complete_duty_confirmation(uuid, text) to service_role;
grant execute on function public.release_duty_notification(uuid, text) to service_role;

-- These functions read the Vault webhook secret and invoke Edge Functions.
-- pg_cron runs them as the database owner; service_role is retained only for
-- trusted server-side diagnosis. Browser roles receive no execute privilege.
revoke all on function public.invoke_duty_notification_processor()
  from public, anon, authenticated;
revoke all on function public.invoke_desk_admin_reminder_check(boolean)
  from public, anon, authenticated;
grant execute on function public.invoke_duty_notification_processor() to service_role;
grant execute on function public.invoke_desk_admin_reminder_check(boolean) to service_role;

commit;
