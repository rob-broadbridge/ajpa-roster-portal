-- Stage 2B: roster bookings may be changed only through the atomic,
-- security-definer apply_duty_assignment_change() procedure.
--
-- Members retain their existing SELECT access so the Calendar, My Shifts,
-- statistics and Desk Admin reminders can continue to read roster data.

revoke insert, update, delete on table public.duty_assignments
  from public, anon, authenticated;
revoke insert, update, delete on table public.recurring_rules
  from public, anon, authenticated;

-- The portal uses this procedure for all booking changes. Re-state its grants
-- here so the intended browser/server access is explicit at the final stage.
revoke all on function public.apply_duty_assignment_change(text, uuid, date, text, integer, date)
  from public, anon;
grant execute on function public.apply_duty_assignment_change(text, uuid, date, text, integer, date)
  to authenticated, service_role;
