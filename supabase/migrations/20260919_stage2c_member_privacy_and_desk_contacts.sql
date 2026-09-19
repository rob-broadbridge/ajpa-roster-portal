-- Stage 2C: minimise member data sent to browsers and expose Desk Admin
-- contact information only through a scoped, auditable report.

begin;

-- The normal roster needs a member directory, but not every member's contact
-- details.  Registrars receive full governance information; everyone else
-- receives only the approved roster directory and eligibility flags needed by
-- the portal interface.
create or replace function public.get_roster_member_directory_for_current_user()
returns table (
  id uuid,
  full_name text,
  warrant_number text,
  email text,
  phone text,
  role text,
  status text,
  is_provisional boolean,
  is_approved boolean,
  can_be_desk_admin boolean,
  reminder_frequency text,
  reminder_start_date date,
  reminder_weeks integer
)
language sql
security definer
set search_path = public
stable
as $$
  with actor as (
    select public.is_approved_registrar() as is_registrar
  )
  select
    member.id,
    member.full_name,
    member.warrant_number,
    case when actor.is_registrar then member.email else null end,
    case when actor.is_registrar then member.phone else null end,
    case when actor.is_registrar then member.role::text else null end,
    case when actor.is_registrar then member.status::text else null end,
    case when actor.is_registrar then member.is_provisional else false end,
    member.status = 'Approved' as is_approved,
    member.status = 'Approved' and member.role in ('Admin', 'Registrar') as can_be_desk_admin,
    case when actor.is_registrar then member.desk_admin_reminder_frequency else null end,
    case when actor.is_registrar then member.desk_admin_reminder_start_date else null end,
    case when actor.is_registrar then member.desk_admin_reminder_weeks else null end
  from public.profiles as member
  cross join actor
  where actor.is_registrar
     or member.status = 'Approved'
     or member.id = auth.uid()
  order by member.full_name;
$$;

-- A JP may read their own profile for sign-in and My Profile. Registrars keep
-- their existing full governance view. The old policy exposed every profile
-- (including email and phone) to every signed-in account.
drop policy if exists "authenticated read profiles" on public.profiles;
create policy own_or_registrar_read_profiles
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_approved_registrar());

revoke all on function public.get_roster_member_directory_for_current_user()
  from public, anon;
grant execute on function public.get_roster_member_directory_for_current_user()
  to authenticated, service_role;

-- Contact details for volunteers who follow a desk are available only to an
-- approved Registrar or the assigned Primary/Secondary Desk Admin. Passing
-- NULL returns the distinct followers across all desks the caller may manage.
create or replace function public.get_desk_follower_contacts_for_current_user(p_desk_id uuid default null)
returns table (
  profile_id uuid,
  full_name text,
  warrant_number text,
  email text,
  phone text
)
language sql
security definer
set search_path = public
stable
as $$
  select distinct
    member.id as profile_id,
    member.full_name,
    member.warrant_number,
    member.email,
    coalesce(member.phone, '') as phone
  from public.desk_follows as follow
  join public.service_desks as desk on desk.id = follow.desk_id
  join public.profiles as member on member.id = follow.profile_id
  where desk.status = 'Active'
    and not coalesce(desk.is_home_based_service, false)
    and (p_desk_id is null or desk.id = p_desk_id)
    and member.status = 'Approved'
    and public.is_registrar_or_assigned_desk_admin(desk.id)
  order by member.full_name, member.warrant_number;
$$;

create index if not exists desk_follows_desk_profile_idx
  on public.desk_follows (desk_id, profile_id);

revoke all on function public.get_desk_follower_contacts_for_current_user(uuid)
  from public, anon;
grant execute on function public.get_desk_follower_contacts_for_current_user(uuid)
  to authenticated, service_role;

commit;
