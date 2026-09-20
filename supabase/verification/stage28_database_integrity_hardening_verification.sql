-- Stage 8 verification. It returns one row. Every value should be true.

select
  not exists (
    select 1 from public.profiles
    where warrant_number is not null and warrant_number !~ '^JP-[0-9]+$'
  ) as warrant_numbers_are_canonical,
  not exists (
    select warrant_number from public.profiles where warrant_number is not null
    group by warrant_number having count(*) > 1
  ) as warrant_numbers_are_unique,
  not exists (
    select 1 from public.duty_assignments
    group by profile_id, slot_id, duty_date having count(*) > 1
  ) as assignments_are_unique,
  not exists (
    select 1 from public.duty_statistics
    where coalesce(no_of_clients, 0) < 0
       or coalesce(no_of_hours_worked, 0) < 0
       or coalesce(certified_copies, 0) < 0
       or coalesce(statutory_declarations, 0) < 0
       or coalesce(signatures_witnessed, 0) < 0
       or coalesce(affidavits, 0) < 0
       or coalesce(other_duties, 0) < 0
    union all
    select 1 from public.duty_statistics
    group by profile_id, slot_id, duty_date having count(*) > 1
  ) as statistics_are_valid_and_unique,
  6 = (
    select count(*) from pg_constraint
    where conname in (
      'duty_slots_valid_time_range', 'duty_slots_valid_capacity_range',
      'service_desks_distinct_administrators', 'profiles_warrant_number_format',
      'duty_slots_valid_day_of_week', 'duty_statistics_non_negative_values'
    ) and convalidated
  ) as all_six_constraints_are_validated,
  3 = (
    select count(*) from pg_index
    where indexrelid::regclass::text in (
      'profiles_warrant_number_unique_idx',
      'duty_assignments_member_occurrence_unique_idx',
      'duty_statistics_member_occurrence_unique_idx'
    ) and indisunique
  ) as all_three_unique_indexes_exist,
  not has_table_privilege('anon', 'public.duty_statistics', 'insert') as anon_statistics_insert_is_blocked,
  not has_table_privilege('authenticated', 'public.duty_statistics', 'insert') as member_statistics_insert_is_blocked,
  not has_table_privilege('authenticated', 'public.duty_statistics', 'update') as member_statistics_update_is_blocked,
  not has_table_privilege('authenticated', 'public.duty_statistics', 'delete') as member_statistics_delete_is_blocked;
