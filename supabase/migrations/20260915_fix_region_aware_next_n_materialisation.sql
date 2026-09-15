-- Correct the region-timezone version of the recurring assignment materialiser.
-- The timezone upgrade replaced the earlier fixed NEXT_N implementation with
-- a rolling one. NEXT_N must remain the original N occurrences, not create
-- replacement bookings as earlier dates pass.

create or replace function public.materialize_recurring_duty_assignments(
  p_horizon_days integer default 365
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_slot record;
  v_date date;
  v_today date;
  v_now_time time;
  v_horizon_date date;
  v_series_start_date date;
  v_series_end_date date;
  v_registered_count integer;
  v_inserted_count integer := 0;
  v_withdrawn_count integer := 0;
begin
  -- Registrations are applied first, then explicit withdrawals. This ensures
  -- a saved withdrawal exception always wins over a recurring registration.
  for v_rule in
    select *
    from public.recurring_rules
    order by case when action = 'REGISTER' then 0 else 1 end, created_at, id
  loop
    select
      slot.*,
      coalesce(region.timezone, 'Pacific/Auckland') as roster_timezone
    into v_slot
    from public.duty_slots as slot
    join public.service_desks as desk on desk.id = slot.desk_id
    left join public.regions as region on region.id = desk.region_id
    where slot.id = v_rule.slot_id
      and slot.status = 'Active'
      and desk.status = 'Active'
    for update of slot;

    if not found then
      continue;
    end if;

    v_today := timezone(v_slot.roster_timezone, now())::date;
    v_now_time := timezone(v_slot.roster_timezone, now())::time;
    v_horizon_date := v_today + least(greatest(coalesce(p_horizon_days, 365), 30), 730);

    if v_rule.rule_type = 'NEXT_N' then
      -- Take the first N dates from the original starting date BEFORE omitting
      -- past dates. This keeps a Next 4 request fixed to its original four.
      v_series_start_date := v_rule.start_date;
      v_series_end_date := v_rule.start_date + 730;
    else
      v_series_start_date := greatest(v_rule.start_date, v_today);
      v_series_end_date := case
        when v_rule.rule_type = 'UNTIL_DATE' then least(v_rule.until_date, v_horizon_date)
        else v_horizon_date
      end;
    end if;

    if v_series_end_date is null or v_series_end_date < v_series_start_date then
      continue;
    end if;

    for v_date in
      with fixed_rule_occurrences as (
        select occurrence.duty_date
        from public.duty_slot_occurrence_dates(
          v_rule.slot_id,
          v_series_start_date,
          v_series_end_date,
          v_rule.action = 'WITHDRAW'
        ) as occurrence
        order by occurrence.duty_date
        limit case
          when v_rule.rule_type = 'NEXT_N'
            then least(greatest(coalesce(v_rule.count_n, 1), 1), 52)
          else 2147483647
        end
      )
      select occurrence.duty_date
      from fixed_rule_occurrences as occurrence
      where occurrence.duty_date > v_today
        or (occurrence.duty_date = v_today and coalesce(v_slot.end_time, time '00:00') > v_now_time)
      order by occurrence.duty_date
    loop
      if v_rule.action = 'REGISTER' then
        select count(*) into v_registered_count
        from public.duty_assignments
        where slot_id = v_rule.slot_id and duty_date = v_date;

        if v_registered_count < v_slot.max_jps then
          insert into public.duty_assignments (profile_id, slot_id, duty_date)
          values (v_rule.profile_id, v_rule.slot_id, v_date)
          on conflict do nothing;
          if found then v_inserted_count := v_inserted_count + 1; end if;
        end if;
      else
        delete from public.duty_assignments
        where profile_id = v_rule.profile_id
          and slot_id = v_rule.slot_id
          and duty_date = v_date;
        if found then v_withdrawn_count := v_withdrawn_count + 1; end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'inserted_assignments', v_inserted_count,
    'withdrawn_assignments', v_withdrawn_count
  );
end;
$$;

revoke all on function public.materialize_recurring_duty_assignments(integer)
  from public, anon, authenticated;
grant execute on function public.materialize_recurring_duty_assignments(integer)
  to service_role;
