-- Stage 4: support the bounded operational-roster reads used by the portal.
-- These indexes are additive and do not alter existing roster data or rules.

create index if not exists duty_assignments_duty_date_slot_idx
  on public.duty_assignments (duty_date, slot_id);

create index if not exists duty_slot_holiday_overrides_duty_date_slot_idx
  on public.duty_slot_holiday_overrides (duty_date, duty_slot_id);

create index if not exists duty_statistics_duty_date_desc_idx
  on public.duty_statistics (duty_date desc);

create index if not exists duty_statistics_profile_date_desc_idx
  on public.duty_statistics (profile_id, duty_date desc);
