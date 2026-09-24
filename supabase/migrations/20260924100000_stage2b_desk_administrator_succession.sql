-- Stage 2B: atomic Desk Administrator succession, vacancies and Registrar-only creation.
-- Applies to the verified current production-shaped schema; do not replay history.
begin;

alter table public.service_desks alter column primary_admin_id drop not null;

create or replace function public.validate_service_desk_administrators()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.primary_admin_id is not null and not exists (
    select 1 from public.profiles where id = new.primary_admin_id and status = 'Approved' and role = 'Admin'
  ) then
    raise exception 'The selected Primary Desk Admin must be an approved Admin.';
  end if;
  if new.secondary_admin_id is not null and not exists (
    select 1 from public.profiles where id = new.secondary_admin_id and status = 'Approved' and role = 'Admin'
  ) then
    raise exception 'The selected Secondary Desk Admin must be an approved Admin.';
  end if;
  if new.primary_admin_id is not null and new.secondary_admin_id = new.primary_admin_id then
    raise exception 'Primary and Secondary Desk Admins must be different people.';
  end if;
  return new;
end;
$$;

drop trigger if exists service_desks_validate_administrators on public.service_desks;
create trigger service_desks_validate_administrators
before insert or update of primary_admin_id, secondary_admin_id on public.service_desks
for each row execute function public.validate_service_desk_administrators();

create or replace function public.create_service_desk_for_current_user(
  p_code text, p_name text, p_address text, p_region_id uuid,
  p_primary_admin_id uuid default null, p_secondary_admin_id uuid default null,
  p_site_contact_name text default '', p_site_contact_email text default '',
  p_contact_person text default '', p_notes text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_desk_id uuid;
begin
  if not public.is_approved_registrar() then
    raise exception using errcode='42501', message='Only an approved Registrar can create a Service Desk.';
  end if;
  if not exists (select 1 from public.regions where id=p_region_id) then raise exception 'Select a valid region.'; end if;
  insert into public.service_desks(code,name,address,region_id,primary_admin_id,secondary_admin_id,site_contact_name,site_contact_email,contact_person,notes)
  values (upper(trim(p_code)),trim(p_name),trim(p_address),p_region_id,p_primary_admin_id,p_secondary_admin_id,coalesce(p_site_contact_name,''),coalesce(p_site_contact_email,''),coalesce(p_contact_person,''),coalesce(p_notes,''))
  returning id into v_desk_id;
  return v_desk_id;
end;
$$;
revoke all on function public.create_service_desk_for_current_user(text,text,text,uuid,uuid,uuid,text,text,text,text) from public, anon;
grant execute on function public.create_service_desk_for_current_user(text,text,text,uuid,uuid,uuid,text,text,text,text) to authenticated, service_role;

create or replace function public.update_service_desk_with_administrators(
  p_desk_id uuid, p_code text, p_name text, p_address text, p_region_id uuid,
  p_primary_admin_id uuid, p_secondary_admin_id uuid,
  p_expected_primary_admin_id uuid, p_expected_secondary_admin_id uuid,
  p_site_contact_name text default '', p_site_contact_email text default '',
  p_contact_person text default '', p_notes text default '')
returns public.service_desks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; desk public.service_desks; registrar boolean; assigned boolean;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status <> 'Approved' then
    raise exception using errcode='42501', message='Only an approved account may maintain a Service Desk.';
  end if;
  select * into desk from public.service_desks where id=p_desk_id for update;
  if desk.id is null then raise exception 'Service Desk not found.'; end if;
  registrar := actor.role='Registrar';
  assigned := actor.role='Admin' and (desk.primary_admin_id=actor.id or desk.secondary_admin_id=actor.id);
  if not registrar and not assigned then raise exception using errcode='42501', message='You are not an assigned Admin for this Service Desk.'; end if;
  if desk.primary_admin_id is distinct from p_expected_primary_admin_id or desk.secondary_admin_id is distinct from p_expected_secondary_admin_id then
    raise exception using errcode='40001', message='The Desk Administrator assignments have changed since you opened this desk. Please review the current assignments and try again.';
  end if;
  if p_primary_admin_id is not null and not exists(select 1 from profiles where id=p_primary_admin_id and status='Approved' and role='Admin') then raise exception 'The selected Primary Desk Admin must be an approved Admin.'; end if;
  if p_secondary_admin_id is not null and not exists(select 1 from profiles where id=p_secondary_admin_id and status='Approved' and role='Admin') then raise exception 'The selected Secondary Desk Admin must be an approved Admin.'; end if;
  if p_primary_admin_id is not null and p_primary_admin_id=p_secondary_admin_id then raise exception 'Primary and Secondary Desk Admins must be different people.'; end if;
  if not registrar and p_primary_admin_id is null and p_secondary_admin_id is null then raise exception using errcode='42501', message='An Admin may remove themselves only when another Admin remains.'; end if;
  if not exists(select 1 from regions where id=p_region_id) then raise exception 'Select a valid region.'; end if;
  update service_desks set code=upper(trim(p_code)), name=trim(p_name), address=trim(p_address), region_id=p_region_id,
    primary_admin_id=p_primary_admin_id, secondary_admin_id=p_secondary_admin_id,
    site_contact_name=coalesce(p_site_contact_name,''), site_contact_email=coalesce(p_site_contact_email,''),
    contact_person=coalesce(p_contact_person,''), notes=coalesce(p_notes,''), updated_at=now()
    where id=p_desk_id returning * into desk;
  return desk;
end;
$$;
revoke all on function public.update_service_desk_with_administrators(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,text) from public, anon;
grant execute on function public.update_service_desk_with_administrators(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,text) to authenticated, service_role;

revoke all on public.service_desks from authenticated;
grant select on public.service_desks to authenticated;
grant update (code, name, address, region_id, site_contact_name, site_contact_email, contact_person, notes, status) on public.service_desks to authenticated;

-- Assigned Admins need role/status metadata for the maintenance selectors;
-- expose it only for Approved Admin candidates (Registrars retain the full
-- directory view they already had).
create or replace function public.get_roster_member_directory_for_current_user()
returns table(id uuid, full_name text, warrant_number text, email text, phone text, role text, status text, is_provisional boolean, is_approved boolean, can_be_desk_admin boolean, reminder_frequency text, reminder_start_date date, reminder_weeks integer)
language sql stable security definer set search_path = public as $$
  with actor as (select public.is_approved_registrar() as is_registrar)
  select member.id, member.full_name, member.warrant_number,
    case when actor.is_registrar then member.email else null end,
    case when actor.is_registrar then member.phone else null end,
    case when actor.is_registrar or (member.status='Approved' and member.role='Admin') then member.role::text else null end,
    case when actor.is_registrar or (member.status='Approved' and member.role='Admin') then member.status::text else null end,
    case when actor.is_registrar then member.is_provisional else false end,
    member.status='Approved', member.status='Approved' and member.role='Admin',
    case when actor.is_registrar then member.desk_admin_reminder_frequency else null end,
    case when actor.is_registrar then member.desk_admin_reminder_start_date else null end,
    case when actor.is_registrar then member.desk_admin_reminder_weeks else null end
  from public.profiles member cross join actor
  where actor.is_registrar or member.status='Approved' or member.id=auth.uid()
  order by member.full_name;
$$;

drop policy if exists registrar_or_assigned_admin_manage_desks on public.service_desks;
create policy registrar_or_assigned_admin_manage_desks on public.service_desks
for update to authenticated
using (public.is_registrar_or_assigned_desk_admin(id))
with check (public.is_registrar_or_assigned_desk_admin(id));

commit;
