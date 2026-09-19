-- Stage 2B: scope Desk Admin maintenance to their assigned Service Desks.
-- Registrars retain governance access across the roster.  On-behalf booking
-- and statistics actions continue through their existing authorised RPCs.

begin;

create or replace function public.is_approved_registrar()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'Approved'
      and role = 'Registrar'
  );
$$;

create or replace function public.is_assigned_desk_admin(p_desk_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles as actor
    join public.service_desks as desk
      on desk.primary_admin_id = actor.id
      or desk.secondary_admin_id = actor.id
    where actor.id = auth.uid()
      and actor.status = 'Approved'
      and actor.role = 'Admin'
      and desk.id = p_desk_id
  );
$$;

-- Keep the previously introduced helper consistent with the scoped role
-- model, including the requirement that a Desk Admin remains approved.
create or replace function public.is_registrar_or_assigned_desk_admin(p_desk_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_approved_registrar()
      or public.is_assigned_desk_admin(p_desk_id);
$$;

revoke all on function public.is_approved_registrar() from public, anon;
revoke all on function public.is_assigned_desk_admin(uuid) from public, anon;
revoke all on function public.is_registrar_or_assigned_desk_admin(uuid) from public, anon;
grant execute on function public.is_approved_registrar() to authenticated, service_role;
grant execute on function public.is_assigned_desk_admin(uuid) to authenticated, service_role;
grant execute on function public.is_registrar_or_assigned_desk_admin(uuid) to authenticated, service_role;

-- Only Registrars may govern member account records directly.  Each JP still
-- maintains their own profile through update_my_profile(), which enforces the
-- current user internally.
drop policy if exists "manager manage profiles" on public.profiles;
create policy registrar_manage_profiles
on public.profiles for all to authenticated
using (public.is_approved_registrar())
with check (public.is_approved_registrar());

-- Regions are roster governance data, not individual desk configuration.
drop policy if exists "manager manage regions" on public.regions;
create policy registrar_manage_regions
on public.regions for all to authenticated
using (public.is_approved_registrar())
with check (public.is_approved_registrar());

-- A Registrar may maintain every desk.  A Desk Admin may maintain only an
-- assigned desk, and cannot remove their own assignment through an update.
drop policy if exists "manager manage desks" on public.service_desks;
create policy registrar_or_assigned_admin_manage_desks
on public.service_desks for update to authenticated
using (public.is_registrar_or_assigned_desk_admin(id))
with check (public.is_registrar_or_assigned_desk_admin(id));

-- Service Desk creation remains through create_service_desk_for_current_user,
-- which assigns the creator as the default Primary Desk Admin.

-- Slots can be maintained only by a Registrar or an Admin assigned to the
-- slot's Service Desk.
drop policy if exists "manager manage slots" on public.duty_slots;
create policy registrar_or_assigned_admin_manage_slots
on public.duty_slots for all to authenticated
using (public.is_registrar_or_assigned_desk_admin(desk_id))
with check (public.is_registrar_or_assigned_desk_admin(desk_id));

-- Restore the original desk-scoped holiday rule.  A global Admin role alone
-- is not sufficient: the Admin must be assigned to the relevant desk.
drop policy if exists duty_slot_holiday_overrides_admin_write on public.duty_slot_holiday_overrides;
create policy registrar_or_assigned_admin_manage_holiday_overrides
on public.duty_slot_holiday_overrides for all to authenticated
using (
  exists (
    select 1
    from public.duty_slots as slot
    where slot.id = duty_slot_holiday_overrides.duty_slot_id
      and public.is_registrar_or_assigned_desk_admin(slot.desk_id)
  )
)
with check (
  exists (
    select 1
    from public.duty_slots as slot
    where slot.id = duty_slot_holiday_overrides.duty_slot_id
      and public.is_registrar_or_assigned_desk_admin(slot.desk_id)
  )
);

-- Direct writes are not the on-behalf workflow.  They are limited to a
-- member's own booking or a Registrar; scoped Desk Admin work goes through
-- apply_duty_assignment_change_for_member().
drop policy if exists "own withdraw assignment" on public.duty_assignments;
create policy own_or_registrar_withdraw_assignment
on public.duty_assignments for delete to authenticated
using (profile_id = auth.uid() or public.is_approved_registrar());

drop policy if exists "manager manage cancellations" on public.duty_cancellations;
create policy registrar_manage_cancellations
on public.duty_cancellations for all to authenticated
using (public.is_approved_registrar())
with check (public.is_approved_registrar());

-- Members can read and maintain their own statistics.  Registrars can see all
-- statistics; Desk Admins can see statistics for their assigned desks and use
-- the authorised on-behalf RPC to make changes.
drop policy if exists "own edit statistics" on public.duty_statistics;
create policy own_or_registrar_edit_statistics
on public.duty_statistics for update to authenticated
using (profile_id = auth.uid() or public.is_approved_registrar())
with check (profile_id = auth.uid() or public.is_approved_registrar());

drop policy if exists "read statistics" on public.duty_statistics;
create policy own_registrar_or_assigned_admin_read_statistics
on public.duty_statistics for select to authenticated
using (
  profile_id = auth.uid()
  or public.is_approved_registrar()
  or exists (
    select 1
    from public.duty_slots as slot
    where slot.id = duty_statistics.slot_id
      and public.is_assigned_desk_admin(slot.desk_id)
  )
);

drop policy if exists "own rules" on public.recurring_rules;
create policy own_or_registrar_manage_rules
on public.recurring_rules for all to authenticated
using (profile_id = auth.uid() or public.is_approved_registrar())
with check (profile_id = auth.uid() or public.is_approved_registrar());

commit;
