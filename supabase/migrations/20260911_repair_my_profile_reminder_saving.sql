-- Repair / re-apply the My Profile save function.
-- Run this once in the Supabase SQL Editor if the original profile-reminder
-- migration was applied before its final version was available.

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
  is_desk_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'No profile was found for the signed-in user.';
  end if;

  if p_reminder_frequency not in ('NONE', 'WEEKLY', 'FORTNIGHTLY') then
    raise exception 'Invalid Desk Admin reminder frequency.';
  end if;

  if p_reminder_weeks not between 1 and 52 then
    raise exception 'Weeks to report on must be between 1 and 52.';
  end if;

  select exists (
    select 1
    from public.service_desks
    where primary_admin_id = auth.uid()
       or secondary_admin_id = auth.uid()
  ) into is_desk_admin;

  update public.profiles
  set phone = nullif(trim(coalesce(p_phone, '')), ''),
      desk_admin_reminder_frequency = case
        when is_desk_admin then p_reminder_frequency else 'NONE'
      end,
      desk_admin_reminder_start_date = case
        when is_desk_admin and p_reminder_frequency <> 'NONE' then p_reminder_start_date else null
      end,
      desk_admin_reminder_weeks = case
        when is_desk_admin then p_reminder_weeks else 4
      end
  where id = auth.uid();

  if not found then
    raise exception 'Your application profile could not be found.';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text, date, integer) from public;
grant execute on function public.update_my_profile(text, text, date, integer) to authenticated;
