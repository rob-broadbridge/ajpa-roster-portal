-- Store every JP warrant number in one canonical form: JP- followed by digits.
-- Screens collect only the numeric part, while this trigger protects all other
-- write paths (including sign-up and Registrar maintenance).

update public.profiles
set warrant_number = 'JP-' || regexp_replace(
  regexp_replace(upper(trim(warrant_number)), '^JP[[:space:]-]*', ''),
  '[^0-9]',
  '',
  'g'
)
where warrant_number is not null
  and trim(warrant_number) <> ''
  and warrant_number ~ '[0-9]';

create or replace function public.normalise_jp_warrant_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  warrant_digits text;
begin
  warrant_digits := regexp_replace(
    regexp_replace(upper(trim(coalesce(new.warrant_number, ''))), '^JP[[:space:]-]*', ''),
    '[^0-9]',
    '',
    'g'
  );

  if warrant_digits = '' then
    raise exception 'Enter the numeric part of the JP warrant number.';
  end if;

  new.warrant_number := 'JP-' || warrant_digits;
  return new;
end;
$$;

drop trigger if exists profiles_normalise_jp_warrant_number on public.profiles;
create trigger profiles_normalise_jp_warrant_number
before insert or update of warrant_number on public.profiles
for each row
execute function public.normalise_jp_warrant_number();

-- My Profile previously maintained only contact and reminder fields.  This
-- overload adds the member's warrant number while retaining the former
-- function for an already-open older browser tab.
create or replace function public.update_my_profile(
  p_phone text,
  p_warrant_number text,
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
      warrant_number = p_warrant_number,
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

revoke all on function public.update_my_profile(text, text, text, date, integer) from public;
grant execute on function public.update_my_profile(text, text, text, date, integer) to authenticated;
