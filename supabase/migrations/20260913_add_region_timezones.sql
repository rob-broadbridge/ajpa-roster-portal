-- Stage 5: every roster region owns its local IANA timezone.
-- Existing data remains Auckland-based and therefore behaves exactly as before.

alter table public.regions
  add column if not exists timezone text;

update public.regions
set timezone = 'Pacific/Auckland'
where timezone is null or btrim(timezone) = '';

alter table public.regions
  alter column timezone set default 'Pacific/Auckland',
  alter column timezone set not null;

comment on column public.regions.timezone is
  'IANA timezone for all service desks in this region, e.g. Pacific/Auckland.';
