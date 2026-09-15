-- Desk Maintenance: enforce a valid Primary Desk Admin and provide narrowly
-- authorised, auditable staff actions for bookings and statistics.

create or replace function public.is_registrar_or_assigned_desk_admin(p_desk_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles actor where actor.id = auth.uid() and actor.status = 'Approved' and actor.role = 'Registrar')
  or exists (select 1 from public.service_desks desk where desk.id = p_desk_id and (desk.primary_admin_id = auth.uid() or desk.secondary_admin_id = auth.uid()));
$$;
revoke all on function public.is_registrar_or_assigned_desk_admin(uuid) from public, anon, authenticated;

create or replace function public.validate_service_desk_administrators()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.primary_admin_id is null then raise exception 'A Service Desk must have a Primary Desk Admin.'; end if;
  if not exists (select 1 from public.profiles where id = new.primary_admin_id and status = 'Approved' and role in ('Admin', 'Registrar')) then
    raise exception 'The selected Primary Desk Admin must be an approved Desk Admin or Registrar.';
  end if;
  if new.secondary_admin_id is not null and not exists (select 1 from public.profiles where id = new.secondary_admin_id and status = 'Approved' and role in ('Admin', 'Registrar')) then
    raise exception 'The selected Secondary Desk Admin must be an approved Desk Admin or Registrar.';
  end if;
  if new.secondary_admin_id is not null and new.secondary_admin_id = new.primary_admin_id then raise exception 'Primary and Secondary Desk Admins must be different people.'; end if;
  return new;
end;
$$;
drop trigger if exists service_desks_validate_administrators on public.service_desks;
create trigger service_desks_validate_administrators before insert or update of primary_admin_id, secondary_admin_id on public.service_desks for each row execute function public.validate_service_desk_administrators();
alter table public.service_desks alter column primary_admin_id set not null;

create or replace function public.create_service_desk_for_current_user(p_code text, p_name text, p_address text, p_region_id uuid, p_primary_admin_id uuid default null, p_secondary_admin_id uuid default null, p_site_contact_name text default '', p_site_contact_email text default '', p_contact_person text default '', p_notes text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_primary uuid := coalesce(p_primary_admin_id, auth.uid()); v_desk_id uuid;
begin
  if v_actor is null or not exists (select 1 from public.profiles where id = v_actor and status = 'Approved') or not public.is_registrar_or_assigned_desk_admin((select id from public.service_desks where primary_admin_id = v_actor or secondary_admin_id = v_actor limit 1)) then raise exception 'Only an approved Registrar or assigned Desk Admin can create a Service Desk.'; end if;
  if not exists (select 1 from public.regions where id = p_region_id) then raise exception 'Select a valid region.'; end if;
  insert into public.service_desks (code,name,address,region_id,primary_admin_id,secondary_admin_id,site_contact_name,site_contact_email,contact_person,notes)
  values (upper(trim(p_code)),trim(p_name),trim(p_address),p_region_id,v_primary,p_secondary_admin_id,coalesce(p_site_contact_name,''),coalesce(p_site_contact_email,''),coalesce(p_contact_person,''),coalesce(p_notes,'')) returning id into v_desk_id;
  return v_desk_id;
end;
$$;
revoke all on function public.create_service_desk_for_current_user(text, text, text, uuid, uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.create_service_desk_for_current_user(text, text, text, uuid, uuid, uuid, text, text, text, text) to authenticated;

create or replace function public.apply_duty_assignment_change_for_member(p_member_id uuid, p_action text, p_slot_id uuid, p_duty_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor_id uuid := auth.uid(); v_slot record; v_registered_count integer; v_finished boolean;
begin
  if v_actor_id is null then raise exception 'You must be signed in to change a roster booking.'; end if;
  p_action := upper(coalesce(p_action, ''));
  if p_action not in ('REGISTER', 'WITHDRAW') then raise exception 'Booking action must be REGISTER or WITHDRAW.'; end if;
  if p_duty_date is null then raise exception 'A duty date is required.'; end if;
  if not exists (select 1 from public.profiles where id = p_member_id and status = 'Approved') then raise exception 'The selected JP member is not an active approved member.'; end if;
  select slot.*, desk.id as desk_id, coalesce(region.timezone, 'Pacific/Auckland') as roster_timezone into v_slot from public.duty_slots slot join public.service_desks desk on desk.id = slot.desk_id left join public.regions region on region.id = desk.region_id where slot.id = p_slot_id and slot.status = 'Active' and desk.status = 'Active' for update of slot;
  if not found then raise exception 'This duty slot is no longer active.'; end if;
  if not public.is_registrar_or_assigned_desk_admin(v_slot.desk_id) then raise exception 'You are not an assigned Desk Admin for this Service Desk.'; end if;
  if not exists (select 1 from public.duty_slot_occurrence_dates(p_slot_id,p_duty_date,p_duty_date,p_action = 'WITHDRAW') occurrence where occurrence.duty_date = p_duty_date) then raise exception 'This slot does not occur on the selected date or is closed for a holiday.'; end if;
  v_finished := p_duty_date + v_slot.end_time <= timezone(v_slot.roster_timezone, now());
  if p_action = 'REGISTER' then
    if exists (select 1 from public.duty_assignments where profile_id=p_member_id and slot_id=p_slot_id and duty_date=p_duty_date) then raise exception 'This JP member is already registered for this shift.'; end if;
    select count(*) into v_registered_count from public.duty_assignments where slot_id=p_slot_id and duty_date=p_duty_date;
    if v_registered_count >= v_slot.max_jps then raise exception 'This slot is already full.'; end if;
    delete from public.recurring_rules where profile_id=p_member_id and slot_id=p_slot_id and action='WITHDRAW' and rule_type='NEXT_N' and start_date=p_duty_date and count_n=1;
    insert into public.duty_assignments (profile_id,slot_id,duty_date) values (p_member_id,p_slot_id,p_duty_date);
  else
    if not exists (select 1 from public.duty_assignments where profile_id=p_member_id and slot_id=p_slot_id and duty_date=p_duty_date) then raise exception 'This JP member is not registered for this shift.'; end if;
    delete from public.duty_assignments where profile_id=p_member_id and slot_id=p_slot_id and duty_date=p_duty_date;
    if not v_finished then
      delete from public.recurring_rules where profile_id=p_member_id and slot_id=p_slot_id and action='WITHDRAW' and rule_type='NEXT_N' and start_date=p_duty_date and count_n=1;
      insert into public.recurring_rules (profile_id,slot_id,action,rule_type,start_date,count_n) values (p_member_id,p_slot_id,'WITHDRAW','NEXT_N'::public.rule_type,p_duty_date,1);
    end if;
  end if;
  return jsonb_build_object('action',p_action,'member_id',p_member_id,'duty_date',p_duty_date);
end;
$$;
revoke all on function public.apply_duty_assignment_change_for_member(uuid, text, uuid, date) from public, anon;
grant execute on function public.apply_duty_assignment_change_for_member(uuid, text, uuid, date) to authenticated;

create or replace function public.save_duty_statistic_for_member(p_statistic_id uuid, p_member_id uuid, p_slot_id uuid, p_duty_date date, p_values jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_actor_id uuid := auth.uid(); v_desk_id uuid; v_desk_name text; v_desk_code text; v_start_time time; v_end_time time; v_statistic_id uuid;
begin
  select slot.desk_id, desk.name, desk.code, slot.start_time, slot.end_time
  into v_desk_id, v_desk_name, v_desk_code, v_start_time, v_end_time
  from public.duty_slots slot join public.service_desks desk on desk.id=slot.desk_id where slot.id=p_slot_id;
  if v_actor_id is null or v_desk_id is null then raise exception 'A valid signed-in user and duty slot are required.'; end if;
  if v_actor_id <> p_member_id and not public.is_registrar_or_assigned_desk_admin(v_desk_id) then raise exception 'You are not an assigned Desk Admin for this Service Desk.'; end if;
  if not exists (select 1 from public.profiles where id=p_member_id) then raise exception 'The selected JP member does not exist.'; end if;
  if p_statistic_id is null then
    if not exists (select 1 from public.duty_assignments where profile_id=p_member_id and slot_id=p_slot_id and duty_date=p_duty_date) then raise exception 'Statistics can only be added for a JP member registered for this slot.'; end if;
    insert into public.duty_statistics (profile_id,slot_id,duty_date,desk_name_snapshot,desk_code_snapshot,start_time_snapshot,end_time_snapshot,no_of_clients,no_of_hours_worked,certified_copies,statutory_declarations,signatures_witnessed,affidavits,other_duties,notes)
    values (p_member_id,p_slot_id,p_duty_date,v_desk_name,v_desk_code,v_start_time,v_end_time,coalesce((p_values->>'noOfClients')::integer,0),coalesce((p_values->>'noOfHoursWorked')::numeric,0),coalesce((p_values->>'certifiedCopies')::integer,0),coalesce((p_values->>'statutoryDeclarations')::integer,0),coalesce((p_values->>'signatureWitnessed')::integer,0),coalesce((p_values->>'affidavits')::integer,0),coalesce((p_values->>'other')::integer,0),coalesce(p_values->>'notes','')) returning id into v_statistic_id;
  else
    select id into v_statistic_id from public.duty_statistics where id=p_statistic_id and profile_id=p_member_id and slot_id=p_slot_id and duty_date=p_duty_date;
    if v_statistic_id is null then raise exception 'The statistics record could not be found.'; end if;
    update public.duty_statistics set no_of_clients=coalesce((p_values->>'noOfClients')::integer,0),no_of_hours_worked=coalesce((p_values->>'noOfHoursWorked')::numeric,0),certified_copies=coalesce((p_values->>'certifiedCopies')::integer,0),statutory_declarations=coalesce((p_values->>'statutoryDeclarations')::integer,0),signatures_witnessed=coalesce((p_values->>'signatureWitnessed')::integer,0),affidavits=coalesce((p_values->>'affidavits')::integer,0),other_duties=coalesce((p_values->>'other')::integer,0),notes=coalesce(p_values->>'notes','') where id=v_statistic_id;
  end if;
  return v_statistic_id;
end;
$$;
revoke all on function public.save_duty_statistic_for_member(uuid, uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.save_duty_statistic_for_member(uuid, uuid, uuid, date, jsonb) to authenticated;

create or replace function public.delete_duty_statistic_for_member(p_statistic_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_stat record;
begin
  select statistic.id,statistic.profile_id,slot.desk_id into v_stat from public.duty_statistics statistic join public.duty_slots slot on slot.id=statistic.slot_id where statistic.id=p_statistic_id;
  if not found then raise exception 'The statistics record could not be found.'; end if;
  if auth.uid() <> v_stat.profile_id and not public.is_registrar_or_assigned_desk_admin(v_stat.desk_id) then raise exception 'You are not an assigned Desk Admin for this Service Desk.'; end if;
  delete from public.duty_statistics where id=p_statistic_id;
end;
$$;
revoke all on function public.delete_duty_statistic_for_member(uuid) from public, anon;
grant execute on function public.delete_duty_statistic_for_member(uuid) to authenticated;

create or replace function public.get_roster_activity_audit_for_current_user(p_limit integer default 250,p_from_date date default null,p_to_date date default null)
returns setof public.roster_activity_audit language sql security definer set search_path = public stable as $$
  select audit.* from public.roster_activity_audit audit
  where (exists (select 1 from public.profiles where id=auth.uid() and status='Approved' and role='Registrar') or exists (select 1 from public.duty_slots slot join public.service_desks desk on desk.id=slot.desk_id where slot.id=audit.duty_slot_id and (desk.primary_admin_id=auth.uid() or desk.secondary_admin_id=auth.uid())))
  and (p_from_date is null or audit.occurred_at >= p_from_date::timestamptz)
  and (p_to_date is null or audit.occurred_at < (p_to_date+1)::timestamptz)
  order by audit.occurred_at desc limit least(greatest(coalesce(p_limit,250),1),1000);
$$;
revoke all on function public.get_roster_activity_audit_for_current_user(integer, date, date) from public, anon;
grant execute on function public.get_roster_activity_audit_for_current_user(integer, date, date) to authenticated;
