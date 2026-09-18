-- Home Based Service is an internal statistics-only desk. It is retained in
-- the database so that normal statistics maintenance, filtering and exports
-- keep their usual structure, but the portal deliberately excludes it from
-- the Roster and Service Desks screens.

alter table public.service_desks
  add column if not exists is_home_based_service boolean not null default false;

create unique index if not exists service_desks_one_home_based_service_idx
  on public.service_desks (is_home_based_service)
  where is_home_based_service;

do $$
declare
  v_region_id uuid;
  v_primary_admin_id uuid;
begin
  select id into v_region_id
  from public.regions
  order by name
  limit 1;

  select id into v_primary_admin_id
  from public.profiles
  where status = 'Approved'
    and role in ('Registrar', 'Admin')
  order by case when role = 'Registrar' then 0 else 1 end, full_name
  limit 1;

  if v_region_id is null or v_primary_admin_id is null then
    raise exception 'Home Based Service needs an existing region and an approved Registrar or Desk Admin.';
  end if;

  if exists (select 1 from public.service_desks where is_home_based_service) then
    update public.service_desks
    set code = 'HBS',
        name = 'Home Based Service',
        address = 'Private / home-based service',
        status = 'Active'
    where is_home_based_service;
  else
    insert into public.service_desks (
      code, name, address, region_id,
      primary_admin_id, secondary_admin_id, status,
      is_home_based_service
    ) values (
      'HBS', 'Home Based Service', 'Private / home-based service', v_region_id,
      v_primary_admin_id, null, 'Active', true
    );
  end if;
end;
$$;

create or replace function public.save_home_based_duty_statistic(
  p_statistic_id uuid,
  p_duty_date date,
  p_start_time time,
  p_values jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_desk record;
  v_statistic record;
  v_slot_id uuid;
  v_end_time time;
  v_statistic_id uuid;
  v_local_now timestamp;
begin
  if v_actor_id is null
     or not exists (select 1 from public.profiles where id = v_actor_id and status = 'Approved') then
    raise exception 'You must be an approved JP member to save Home Based Service statistics.';
  end if;
  if p_duty_date is null or p_start_time is null then
    raise exception 'A date and start time are required.';
  end if;

  select id, name, code
  into v_desk
  from public.service_desks
  where is_home_based_service
    and status = 'Active'
  limit 1;

  if not found then
    raise exception 'The Home Based Service desk is not available. Run the Home Based Service migration first.';
  end if;

  v_end_time := case
    when p_start_time >= time '23:45' then time '23:59:59'
    else (p_start_time + interval '15 minutes')::time
  end;

  -- Statistics are recorded only after the short home-based service has
  -- finished, consistent with the normal rostered-shift statistics rules.
  select now() at time zone coalesce(region.timezone, 'Pacific/Auckland')
  into v_local_now
  from public.service_desks desk
  join public.regions region on region.id = desk.region_id
  where desk.id = v_desk.id;
  if (p_duty_date + p_start_time + interval '15 minutes') > v_local_now then
    raise exception 'Statistics can be logged only after the Home Based Service has ended.';
  end if;

  if p_statistic_id is null then
    -- Each special statistic receives its own hidden slot. This preserves the
    -- existing duty_statistics foreign-key and maintenance model without
    -- creating a rostered service-desk shift.
    insert into public.duty_slots (
      desk_id, day_of_week, start_time, end_time,
      min_jps, target_jps, max_jps, status, effective_from
    ) values (
      v_desk.id, extract(dow from p_duty_date)::integer, p_start_time, v_end_time,
      1, 1, 1, 'Active', p_duty_date
    ) returning id into v_slot_id;

    insert into public.duty_statistics (
      profile_id, slot_id, duty_date,
      desk_name_snapshot, desk_code_snapshot, start_time_snapshot, end_time_snapshot,
      no_of_clients, no_of_hours_worked, certified_copies, statutory_declarations,
      signatures_witnessed, affidavits, other_duties, notes
    ) values (
      v_actor_id, v_slot_id, p_duty_date,
      v_desk.name, v_desk.code, p_start_time, v_end_time,
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
    select statistic.id, statistic.profile_id, statistic.slot_id
    into v_statistic
    from public.duty_statistics statistic
    join public.duty_slots slot on slot.id = statistic.slot_id
    join public.service_desks desk on desk.id = slot.desk_id
    where statistic.id = p_statistic_id
      and desk.is_home_based_service;

    if not found then
      raise exception 'The Home Based Service statistics record could not be found.';
    end if;
    if v_statistic.profile_id <> v_actor_id
       and not exists (select 1 from public.profiles where id = v_actor_id and status = 'Approved' and role = 'Registrar') then
      raise exception 'Only the JP member or a Registrar can maintain this Home Based Service record.';
    end if;

    update public.duty_slots
    set day_of_week = extract(dow from p_duty_date)::integer,
        start_time = p_start_time,
        end_time = v_end_time,
        effective_from = p_duty_date
    where id = v_statistic.slot_id;

    update public.duty_statistics
    set duty_date = p_duty_date,
        start_time_snapshot = p_start_time,
        end_time_snapshot = v_end_time,
        no_of_clients = coalesce((p_values->>'noOfClients')::integer, 0),
        no_of_hours_worked = coalesce((p_values->>'noOfHoursWorked')::numeric, 0),
        certified_copies = coalesce((p_values->>'certifiedCopies')::integer, 0),
        statutory_declarations = coalesce((p_values->>'statutoryDeclarations')::integer, 0),
        signatures_witnessed = coalesce((p_values->>'signatureWitnessed')::integer, 0),
        affidavits = coalesce((p_values->>'affidavits')::integer, 0),
        other_duties = coalesce((p_values->>'other')::integer, 0),
        notes = coalesce(p_values->>'notes', '')
    where id = v_statistic.id;

    v_statistic_id := v_statistic.id;
  end if;

  return v_statistic_id;
end;
$$;

revoke all on function public.save_home_based_duty_statistic(uuid, date, time, jsonb) from public, anon;
grant execute on function public.save_home_based_duty_statistic(uuid, date, time, jsonb) to authenticated;
