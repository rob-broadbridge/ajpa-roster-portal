-- Stage 6 verification: all three named guards should be listed.
select conrelid::regclass as table_name, conname as constraint_name, convalidated
from pg_constraint
where conname in (
  'duty_slots_valid_time_range',
  'duty_slots_valid_capacity_range',
  'service_desks_distinct_administrators'
)
order by conname;

-- Timezone validation is implemented as a database trigger.
select tgname as trigger_name, tgrelid::regclass as table_name
from pg_trigger
where tgname = 'regions_validate_timezone'
  and not tgisinternal;
