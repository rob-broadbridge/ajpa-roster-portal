-- Stage 2A: remove unnecessary anonymous database access and lock down
-- security-definer helpers which are invoked only by triggers or workers.
--
-- Browser users authenticate before accessing roster data.  The anon role
-- therefore has no legitimate direct table or RPC access in this portal.

begin;

-- RLS was already protecting these tables, but table grants are a second
-- security boundary.  Removing anon privileges prevents future policy or
-- function mistakes from exposing application data before sign-in.
revoke all on table public.desk_admin_monthly_statistics_reports from public, anon;
revoke all on table public.desk_admin_reminder_deliveries from public, anon;
revoke all on table public.desk_follows from public, anon;
revoke all on table public.duty_assignment_notifications from public, anon;
revoke all on table public.duty_assignments from public, anon;
revoke all on table public.duty_cancellations from public, anon;
revoke all on table public.duty_slot_holiday_overrides from public, anon;
revoke all on table public.duty_slots from public, anon;
revoke all on table public.duty_statistics from public, anon;
revoke all on table public.duty_statistics_reminder_settings from public, anon;
revoke all on table public.duty_statistics_reminders from public, anon;
revoke all on table public.profiles from public, anon;
revoke all on table public.recurring_rules from public, anon;
revoke all on table public.regions from public, anon;
revoke all on table public.roster_activity_audit from public, anon;
revoke all on table public.service_desks from public, anon;
revoke all on table public.statutory_holidays from public, anon;
revoke all on table public.user_preferences from public, anon;

-- Explicit signed-in grants preserve the portal's existing read and
-- maintenance paths.  Row Level Security remains the authority that decides
-- which rows each signed-in person may use.
grant select, insert, update, delete on table public.desk_follows to authenticated;
grant select on table public.duty_assignments to authenticated;
grant select on table public.duty_cancellations to authenticated;
grant select, insert, update, delete on table public.duty_slot_holiday_overrides to authenticated;
grant select, insert, update, delete on table public.duty_slots to authenticated;
grant select on table public.duty_statistics to authenticated;
grant select on table public.profiles to authenticated;
grant update on table public.profiles to authenticated;
grant select on table public.recurring_rules to authenticated;
grant select, insert, update, delete on table public.regions to authenticated;
grant select, insert, update, delete on table public.service_desks to authenticated;
grant select, insert, update, delete on table public.statutory_holidays to authenticated;
grant select, insert, update, delete on table public.user_preferences to authenticated;

-- These two functions read the Vault webhook secret and trigger Edge
-- Functions.  They must only be usable by pg_cron/the service role.
revoke all on function public.invoke_duty_statistics_reminder_processor()
  from public, anon, authenticated;
revoke all on function public.invoke_monthly_duty_statistics_report_processor()
  from public, anon, authenticated;
grant execute on function public.invoke_duty_statistics_reminder_processor()
  to service_role;
grant execute on function public.invoke_monthly_duty_statistics_report_processor()
  to service_role;

-- Profile changes require an authenticated member.  Keep both versions for
-- compatibility with an already-open older portal session, but never anon.
revoke all on function public.update_my_profile(text, text, date, integer)
  from public, anon;
revoke all on function public.update_my_profile(text, text, text, date, integer)
  from public, anon;
grant execute on function public.update_my_profile(text, text, date, integer)
  to authenticated;
grant execute on function public.update_my_profile(text, text, text, date, integer)
  to authenticated;

-- is_manager() is used by existing RLS policies.  Signed-in access remains
-- necessary for those policies; anonymous callers receive none.
revoke all on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated, service_role;

-- The following are trigger-only or superseded helpers.  They do not form a
-- browser API and should not be callable through the public RPC endpoint.
revoke all on function public.audit_roster_activity()
  from public, anon, authenticated;
revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.notify_member_on_profile_approval()
  from public, anon, authenticated;
revoke all on function public.notify_registrars_of_new_profile()
  from public, anon, authenticated;
revoke all on function public.prevent_holiday_duty_assignment()
  from public, anon, authenticated;
revoke all on function public.queue_duty_assignment_notification()
  from public, anon, authenticated;
revoke all on function public.send_calendar_invite_on_duty_assignment()
  from public, anon, authenticated;
revoke all on function public.sync_profile_email_from_auth()
  from public, anon, authenticated;
revoke all on function public.validate_service_desk_administrators()
  from public, anon, authenticated;
revoke all on function public.register_for_duty(uuid, date)
  from public, anon, authenticated;

commit;
