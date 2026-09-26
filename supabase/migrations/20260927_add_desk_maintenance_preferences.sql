-- Persist Desk Maintenance filter preferences alongside the existing user filters.
alter table public.user_preferences
  add column if not exists desk_maintenance_filters jsonb
  not null
  default '{}'::jsonb;
