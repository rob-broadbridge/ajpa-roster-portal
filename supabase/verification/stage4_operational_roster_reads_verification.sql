-- Stage 4 verification: run after the query-index migration.
-- The result should list each of the four Stage 4 indexes.

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'duty_assignments_duty_date_slot_idx',
    'duty_slot_holiday_overrides_duty_date_slot_idx',
    'duty_statistics_duty_date_desc_idx',
    'duty_statistics_profile_date_desc_idx'
  )
order by indexname;
