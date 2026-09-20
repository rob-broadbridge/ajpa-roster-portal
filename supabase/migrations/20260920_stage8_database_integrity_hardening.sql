-- Review Stage 8: validate the previously introduced roster safeguards and
-- ensure that the database itself preserves the core one-record-per-occurrence
-- model. The preflight checks make this migration safe to run on the live
-- database: if historic data needs attention, it stops without making changes.

begin;

do $$
begin
  if exists (
    select 1
    from public.duty_slots
    where start_time >= end_time
       or min_jps < 0
       or target_jps < min_jps
       or max_jps < target_jps
       or day_of_week not between 0 and 6
  ) then
    raise exception 'Stage 8 stopped: one or more duty slots has an invalid day, time range, or capacity range.';
  end if;

  if exists (
    select 1
    from public.service_desks
    where secondary_admin_id is not null
      and secondary_admin_id = primary_admin_id
  ) then
    raise exception 'Stage 8 stopped: a Service Desk cannot use the same person as both Primary and Secondary Desk Admin.';
  end if;

  if exists (
    select 1
    from public.profiles
    where warrant_number is not null
      and warrant_number !~ '^JP-[0-9]+$'
  ) then
    raise exception 'Stage 8 stopped: one or more warrant numbers are not in the required JP-12345 format.';
  end if;

  if exists (
    select warrant_number
    from public.profiles
    where warrant_number is not null
    group by warrant_number
    having count(*) > 1
  ) then
    raise exception 'Stage 8 stopped: duplicate JP warrant numbers must be resolved before the unique safeguard can be enabled.';
  end if;

  if exists (
    select 1
    from public.duty_assignments
    group by profile_id, slot_id, duty_date
    having count(*) > 1
  ) then
    raise exception 'Stage 8 stopped: duplicate duty assignments must be resolved before the unique safeguard can be enabled.';
  end if;

  if exists (
    select 1
    from public.duty_statistics
    group by profile_id, slot_id, duty_date
    having count(*) > 1
  ) then
    raise exception 'Stage 8 stopped: duplicate duty statistics must be resolved before the unique safeguard can be enabled.';
  end if;

  if exists (
    select 1
    from public.duty_statistics
    where coalesce(no_of_clients, 0) < 0
       or coalesce(no_of_hours_worked, 0) < 0
       or coalesce(certified_copies, 0) < 0
       or coalesce(statutory_declarations, 0) < 0
       or coalesce(signatures_witnessed, 0) < 0
       or coalesce(affidavits, 0) < 0
       or coalesce(other_duties, 0) < 0
  ) then
    raise exception 'Stage 8 stopped: negative statistics values must be corrected before the non-negative safeguard can be enabled.';
  end if;
end;
$$;

-- These constraints were deliberately introduced as NOT VALID during the
-- earlier rollout. Confirm the existing records meet them, then enforce them
-- for every future write as well.
alter table public.duty_slots validate constraint duty_slots_valid_time_range;
alter table public.duty_slots validate constraint duty_slots_valid_capacity_range;
alter table public.service_desks validate constraint service_desks_distinct_administrators;

alter table public.profiles
  drop constraint if exists profiles_warrant_number_format,
  add constraint profiles_warrant_number_format
    check (warrant_number is null or warrant_number ~ '^JP-[0-9]+$') not valid;

alter table public.duty_slots
  drop constraint if exists duty_slots_valid_day_of_week,
  add constraint duty_slots_valid_day_of_week
    check (day_of_week between 0 and 6) not valid;

alter table public.duty_statistics
  drop constraint if exists duty_statistics_non_negative_values,
  add constraint duty_statistics_non_negative_values
    check (
      coalesce(no_of_clients, 0) >= 0
      and coalesce(no_of_hours_worked, 0) >= 0
      and coalesce(certified_copies, 0) >= 0
      and coalesce(statutory_declarations, 0) >= 0
      and coalesce(signatures_witnessed, 0) >= 0
      and coalesce(affidavits, 0) >= 0
      and coalesce(other_duties, 0) >= 0
    ) not valid;

alter table public.profiles validate constraint profiles_warrant_number_format;
alter table public.duty_slots validate constraint duty_slots_valid_day_of_week;
alter table public.duty_statistics validate constraint duty_statistics_non_negative_values;

create unique index if not exists profiles_warrant_number_unique_idx
  on public.profiles (warrant_number)
  where warrant_number is not null;

create unique index if not exists duty_assignments_member_occurrence_unique_idx
  on public.duty_assignments (profile_id, slot_id, duty_date);

create unique index if not exists duty_statistics_member_occurrence_unique_idx
  on public.duty_statistics (profile_id, slot_id, duty_date);

-- Statistics are written through the authorised procedures, which verify the
-- member, slot, date, desk authority and snapshots. Removing direct table
-- writes prevents an API caller from bypassing those checks.
revoke insert, update, delete on table public.duty_statistics
  from public, anon, authenticated;

drop policy if exists "own statistics" on public.duty_statistics;
drop policy if exists "own_or_registrar_edit_statistics" on public.duty_statistics;

commit;
