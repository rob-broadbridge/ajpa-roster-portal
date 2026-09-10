-- Allows the password-reset form to confirm whether a registered AJPA account
-- exists, without giving the browser direct read access to profile records.
-- The application deliberately uses this result to give members a clear
-- "not found" message before it requests Supabase's reset email.

create or replace function public.is_registered_email(email_to_check text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where lower(email) = lower(trim(email_to_check))
  );
$$;

revoke all on function public.is_registered_email(text) from public;
grant execute on function public.is_registered_email(text) to anon, authenticated;
