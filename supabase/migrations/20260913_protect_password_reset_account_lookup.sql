-- Stage 7: prevent the old helper from being used to enumerate portal
-- accounts. Password reset is now handled directly by Supabase Auth, which
-- gives a neutral response irrespective of whether an address exists.

revoke all on function public.is_registered_email(text) from public, anon, authenticated;
grant execute on function public.is_registered_email(text) to service_role;
