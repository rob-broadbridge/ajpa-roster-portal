-- Stage 6: enforce core roster rules in the database as well as the portal.
-- Existing records are left untouched; these guards apply to new and changed
-- data, including future imports and API writes.

create or replace function public.validate_region_timezone()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1 from pg_timezone_names where name = new.timezone
  ) then
    raise exception 'Timezone "%" is not a valid IANA timezone name.', new.timezone;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_region_timezone() from public, anon, authenticated;

drop trigger if exists regions_validate_timezone on public.regions;
create trigger regions_validate_timezone
  before insert or update of timezone on public.regions
  for each row execute function public.validate_region_timezone();

alter table public.duty_slots
  drop constraint if exists duty_slots_valid_time_range,
  add constraint duty_slots_valid_time_range
    check (start_time < end_time) not valid,
  drop constraint if exists duty_slots_valid_capacity_range,
  add constraint duty_slots_valid_capacity_range
    check (
      min_jps >= 0
      and target_jps >= min_jps
      and max_jps >= target_jps
    ) not valid;

alter table public.service_desks
  drop constraint if exists service_desks_distinct_administrators,
  add constraint service_desks_distinct_administrators
    check (
      primary_admin_id is null
      or secondary_admin_id is null
      or primary_admin_id <> secondary_admin_id
    ) not valid;
