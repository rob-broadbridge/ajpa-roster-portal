-- Desk Admins (the Admin role) can maintain Holiday / Desk closed settings
-- for all slots. Statutory-holiday maintenance remains Registrar-only.

drop policy if exists duty_slot_holiday_overrides_admin_write on public.duty_slot_holiday_overrides;

create policy duty_slot_holiday_overrides_admin_write
on public.duty_slot_holiday_overrides for all to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('Registrar', 'Admin')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('Registrar', 'Admin')
  )
);
