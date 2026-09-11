-- Personal contact details and Desk Admin reminder preferences.
-- Reminder settings are stored in Supabase so the scheduled process runs even
-- when the Desk Admin is not signed in to the portal.

alter table public.profiles
  add column if not exists desk_admin_reminder_frequency text not null default 'NONE',
  add column if not exists desk_admin_reminder_start_date date,
  add column if not exists desk_admin_reminder_weeks integer not null default 4;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_desk_admin_reminder_frequency_check'
  ) then
    alter table public.profiles
      add constraint profiles_desk_admin_reminder_frequency_check
      check (desk_admin_reminder_frequency in ('NONE', 'WEEKLY', 'FORTNIGHTLY'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_desk_admin_reminder_weeks_check'
  ) then
    alter table public.profiles
      add constraint profiles_desk_admin_reminder_weeks_check
      check (desk_admin_reminder_weeks between 1 and 52);
  end if;
end;
$$;

-- Members can update only their own phone number and, if they are a Desk
-- Admin, their own reminder settings. Registrar-controlled fields remain
-- unchanged.
create or replace function public.update_my_profile(
  p_phone text,
  p_reminder_frequency text,
  p_reminder_start_date date,
  p_reminder_weeks integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
begin
  select role into current_role
  from public.profiles
  where id = auth.uid();

  if current_role is null then
    raise exception 'No profile was found for the signed-in user.';
  end if;

  if p_reminder_frequency not in ('NONE', 'WEEKLY', 'FORTNIGHTLY') then
    raise exception 'Invalid Desk Admin reminder frequency.';
  end if;

  if p_reminder_weeks not between 1 and 52 then
    raise exception 'Weeks to report on must be between 1 and 52.';
  end if;

  update public.profiles
  set phone = nullif(trim(p_phone), ''),
      desk_admin_reminder_frequency = case when current_role = 'Admin' then p_reminder_frequency else 'NONE' end,
      desk_admin_reminder_start_date = case when current_role = 'Admin' and p_reminder_frequency <> 'NONE' then p_reminder_start_date else null end,
      desk_admin_reminder_weeks = case when current_role = 'Admin' then p_reminder_weeks else 4 end
  where id = auth.uid();
end;
$$;

revoke all on function public.update_my_profile(text, text, date, integer) from public;
grant execute on function public.update_my_profile(text, text, date, integer) to authenticated;

-- Keep the application profile email in step with Supabase Auth once an email
-- change is confirmed. This does not expose auth.users to the browser.
create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id
    and email is distinct from new.email;
  return new;
end;
$$;

drop trigger if exists sync_profile_email_from_auth on auth.users;
create trigger sync_profile_email_from_auth
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_profile_email_from_auth();
