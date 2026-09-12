-- Corrective Stage 1 migration.
-- The first hardening migration may have been applied before an explicit anon
-- grant on this existing function was discovered. Remove that grant while
-- retaining access for signed-in members and trusted server-side code.

revoke all on function public.is_duty_slot_holiday(uuid, date) from public, anon;
grant execute on function public.is_duty_slot_holiday(uuid, date) to authenticated, service_role;
