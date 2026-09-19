-- Stage 3 verification: statistics are now read in bounded date windows by
-- the portal. These pre-existing operational indexes support those reads.
-- Expected: exactly two rows, both with an index definition.
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'duty_statistics'
  and indexname in (
    'duty_statistics_duty_date_desc_idx',
    'duty_statistics_profile_date_desc_idx'
  )
order by indexname;

-- Optional scale check. This reports the total retained history without
-- exposing its contents. A large total is expected: the portal now avoids
-- loading it all at sign-in.
select count(*) as retained_statistics_records
from public.duty_statistics;
