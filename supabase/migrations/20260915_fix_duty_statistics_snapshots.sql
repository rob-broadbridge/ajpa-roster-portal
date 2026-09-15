-- Corrective patch for the Desk Maintenance rollout.
-- It saves the required desk/time snapshots when statistics are logged on a
-- JP member's behalf. Run this after the Desk Maintenance migration.

create or replace function public.save_duty_statistic_for_member(p_statistic_id uuid, p_member_id uuid, p_slot_id uuid, p_duty_date date, p_values jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid();
  v_desk_id uuid;
  v_desk_name text;
  v_desk_code text;
  v_start_time time;
  v_end_time time;
  v_statistic_id uuid;
begin
  select slot.desk_id, desk.name, desk.code, slot.start_time, slot.end_time
  into v_desk_id, v_desk_name, v_desk_code, v_start_time, v_end_time
  from public.duty_slots slot
  join public.service_desks desk on desk.id = slot.desk_id
  where slot.id = p_slot_id;

  if v_actor_id is null or v_desk_id is null then
    raise exception 'A valid signed-in user and duty slot are required.';
  end if;
  if v_actor_id <> p_member_id and not public.is_registrar_or_assigned_desk_admin(v_desk_id) then
    raise exception 'You are not an assigned Desk Admin for this Service Desk.';
  end if;
  if not exists (select 1 from public.profiles where id = p_member_id) then
    raise exception 'The selected JP member does not exist.';
  end if;

  if p_statistic_id is null then
    if not exists (select 1 from public.duty_assignments where profile_id = p_member_id and slot_id = p_slot_id and duty_date = p_duty_date) then
      raise exception 'Statistics can only be added for a JP member registered for this slot.';
    end if;
    insert into public.duty_statistics (
      profile_id, slot_id, duty_date,
      desk_name_snapshot, desk_code_snapshot, start_time_snapshot, end_time_snapshot,
      no_of_clients, no_of_hours_worked, certified_copies, statutory_declarations,
      signatures_witnessed, affidavits, other_duties, notes
    ) values (
      p_member_id, p_slot_id, p_duty_date,
      v_desk_name, v_desk_code, v_start_time, v_end_time,
      coalesce((p_values->>'noOfClients')::integer, 0),
      coalesce((p_values->>'noOfHoursWorked')::numeric, 0),
      coalesce((p_values->>'certifiedCopies')::integer, 0),
      coalesce((p_values->>'statutoryDeclarations')::integer, 0),
      coalesce((p_values->>'signatureWitnessed')::integer, 0),
      coalesce((p_values->>'affidavits')::integer, 0),
      coalesce((p_values->>'other')::integer, 0),
      coalesce(p_values->>'notes', '')
    ) returning id into v_statistic_id;
  else
    select id into v_statistic_id from public.duty_statistics
    where id = p_statistic_id and profile_id = p_member_id and slot_id = p_slot_id and duty_date = p_duty_date;
    if v_statistic_id is null then raise exception 'The statistics record could not be found.'; end if;
    update public.duty_statistics set
      no_of_clients = coalesce((p_values->>'noOfClients')::integer, 0),
      no_of_hours_worked = coalesce((p_values->>'noOfHoursWorked')::numeric, 0),
      certified_copies = coalesce((p_values->>'certifiedCopies')::integer, 0),
      statutory_declarations = coalesce((p_values->>'statutoryDeclarations')::integer, 0),
      signatures_witnessed = coalesce((p_values->>'signatureWitnessed')::integer, 0),
      affidavits = coalesce((p_values->>'affidavits')::integer, 0),
      other_duties = coalesce((p_values->>'other')::integer, 0),
      notes = coalesce(p_values->>'notes', '')
    where id = v_statistic_id;
  end if;
  return v_statistic_id;
end;
$$;

revoke all on function public.save_duty_statistic_for_member(uuid, uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.save_duty_statistic_for_member(uuid, uuid, uuid, date, jsonb) to authenticated;
