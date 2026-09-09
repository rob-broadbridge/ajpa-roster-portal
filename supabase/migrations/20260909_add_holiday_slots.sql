-- Date-specific holiday closures for recurring duty slots.
-- This preserves all existing roster data and assignments.

create table if not exists public.statutory_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  description text not null check (length(trim(description)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.duty_slot_holiday_overrides (
  duty_slot_id uuid not null references public.duty_slots(id) on delete cascade,
  duty_date date not null,
  is_holiday boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (duty_slot_id, duty_date)
);

create index if not exists duty_slot_holiday_overrides_duty_date_idx
  on public.duty_slot_holiday_overrides (duty_date);

alter table public.statutory_holidays enable row level security;
alter table public.duty_slot_holiday_overrides enable row level security;

drop policy if exists statutory_holidays_read_authenticated on public.statutory_holidays;
create policy statutory_holidays_read_authenticated
on public.statutory_holidays for select to authenticated using (true);

drop policy if exists statutory_holidays_registrar_write on public.statutory_holidays;
create policy statutory_holidays_registrar_write
on public.statutory_holidays for all to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'Registrar'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'Registrar'
  )
);

drop policy if exists duty_slot_holiday_overrides_read_authenticated on public.duty_slot_holiday_overrides;
create policy duty_slot_holiday_overrides_read_authenticated
on public.duty_slot_holiday_overrides for select to authenticated using (true);

drop policy if exists duty_slot_holiday_overrides_admin_write on public.duty_slot_holiday_overrides;
create policy duty_slot_holiday_overrides_admin_write
on public.duty_slot_holiday_overrides for all to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'Registrar'
  )
  or exists (
    select 1
    from public.duty_slots
    join public.service_desks on service_desks.id = duty_slots.desk_id
    where duty_slots.id = duty_slot_holiday_overrides.duty_slot_id
      and (service_desks.primary_admin_id = auth.uid() or service_desks.secondary_admin_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'Registrar'
  )
  or exists (
    select 1
    from public.duty_slots
    join public.service_desks on service_desks.id = duty_slots.desk_id
    where duty_slots.id = duty_slot_holiday_overrides.duty_slot_id
      and (service_desks.primary_admin_id = auth.uid() or service_desks.secondary_admin_id = auth.uid())
  )
);

-- A saved override takes priority. Without one, every duty slot on a
-- statutory-holiday date is treated as Holiday = true.
create or replace function public.is_duty_slot_holiday(p_slot_id uuid, p_duty_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select override.is_holiday
      from public.duty_slot_holiday_overrides as override
      where override.duty_slot_id = p_slot_id
        and override.duty_date = p_duty_date
    ),
    exists (
      select 1
      from public.statutory_holidays as holiday
      where holiday.holiday_date = p_duty_date
    )
  );
$$;

grant execute on function public.is_duty_slot_holiday(uuid, date) to authenticated;

-- The browser hides registration controls for Holiday slots. This trigger is
-- the server-side safeguard, so direct or concurrent requests cannot register
-- a JP for a closed slot.
create or replace function public.prevent_holiday_duty_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_duty_slot_holiday(new.slot_id, new.duty_date) then
    raise exception 'This duty slot is closed for a holiday and cannot be registered for.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_holiday_duty_assignment on public.duty_assignments;
create trigger prevent_holiday_duty_assignment
before insert on public.duty_assignments
for each row execute function public.prevent_holiday_duty_assignment();
