-- Stage 9: enforce roster timing in the local IANA timezone of each desk's
-- region. Existing Pacific/Auckland regions retain precisely the same rules.

create or replace function public.queue_duty_assignment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_start_time time;
  minimum_jps integer;
  slot_timezone text;
  remaining_jps integer;
  local_now timestamp;
  shift_starts_at timestamp;
  alert_required boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into public.duty_assignment_notifications (
      profile_id, slot_id, duty_date, status, confirmation_due_at, next_attempt_at
    ) values (
      new.profile_id, new.slot_id, new.duty_date,
      'PENDING_CONFIRMATION', now() + interval '5 minutes', now() + interval '5 minutes'
    );
    return new;
  end if;

  select slot.start_time, slot.min_jps, coalesce(region.timezone, 'Pacific/Auckland')
    into slot_start_time, minimum_jps, slot_timezone
  from public.duty_slots as slot
  join public.service_desks as desk on desk.id = slot.desk_id
  left join public.regions as region on region.id = desk.region_id
  where slot.id = old.slot_id;

  select count(*) into remaining_jps
  from public.duty_assignments
  where slot_id = old.slot_id and duty_date = old.duty_date;

  local_now := timezone(slot_timezone, now());
  shift_starts_at := old.duty_date + coalesce(slot_start_time, time '00:00');
  alert_required := slot_start_time is not null
    and shift_starts_at > local_now
    and shift_starts_at <= local_now + interval '7 days'
    and remaining_jps < coalesce(minimum_jps, 0);

  update public.duty_assignment_notifications as notification
  set status = case when notification.status in ('PENDING_CONFIRMATION', 'PROCESSING_CONFIRMATION')
        then 'CANCELLED_BEFORE_CONFIRMATION' else 'CANCELLATION_PENDING' end,
      cancellation_requested_at = now(),
      desk_admin_alert_required = alert_required,
      processing_started_at = null,
      next_attempt_at = now(),
      failure_count = 0,
      failed_at = null,
      last_error = null,
      updated_at = now()
  where notification.id = (
    select candidate.id
    from public.duty_assignment_notifications as candidate
    where candidate.profile_id = old.profile_id
      and candidate.slot_id = old.slot_id
      and candidate.duty_date = old.duty_date
      and candidate.status in ('PENDING_CONFIRMATION', 'PROCESSING_CONFIRMATION', 'CONFIRMATION_SENT')
    order by candidate.created_at desc
    limit 1
  );
  return old;
end;
$$;

create or replace function public.apply_duty_assignment_change(
  p_action text, p_slot_id uuid, p_start_date date, p_scope text default 'SINGLE',
  p_count_n integer default null, p_until_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_slot record;
  v_today date;
  v_now_time time;
  v_end_date date;
  v_count_n integer;
  v_dates date[];
  v_date date;
  v_registered_count integer;
begin
  if v_profile_id is null then raise exception 'You must be signed in to change a roster booking.'; end if;
  if not exists (select 1 from public.profiles where id = v_profile_id and status = 'Approved') then
    raise exception 'Your account is not approved for roster bookings.';
  end if;
  p_action := upper(coalesce(p_action, ''));
  p_scope := upper(coalesce(p_scope, ''));
  if p_action not in ('REGISTER', 'WITHDRAW') then raise exception 'Booking action must be REGISTER or WITHDRAW.'; end if;
  if p_scope not in ('SINGLE', 'NEXT_N', 'UNTIL_DATE', 'ALL_FUTURE') then raise exception 'Booking scope is not valid.'; end if;
  if p_start_date is null then raise exception 'A booking start date is required.'; end if;

  select slot.*, coalesce(region.timezone, 'Pacific/Auckland') as roster_timezone into v_slot
  from public.duty_slots as slot
  join public.service_desks as desk on desk.id = slot.desk_id
  left join public.regions as region on region.id = desk.region_id
  where slot.id = p_slot_id and slot.status = 'Active' and desk.status = 'Active'
  for update of slot;
  if not found then raise exception 'This duty slot is no longer active.'; end if;

  v_today := timezone(v_slot.roster_timezone, now())::date;
  v_now_time := timezone(v_slot.roster_timezone, now())::time;
  if p_start_date < v_today or (p_start_date = v_today and coalesce(v_slot.end_time, time '00:00') <= v_now_time) then
    raise exception 'A booking cannot be changed after the shift has ended.';
  end if;

  v_count_n := least(greatest(coalesce(p_count_n, 1), 1), 52);
  if p_scope = 'UNTIL_DATE' then
    if p_until_date is null or p_until_date < p_start_date then raise exception 'Choose an end date on or after the first shift.'; end if;
    if p_until_date > p_start_date + 730 then raise exception 'The selected end date is more than two years away.'; end if;
    v_end_date := p_until_date;
  elsif p_scope = 'NEXT_N' then v_end_date := p_start_date + 730;
  elsif p_scope = 'ALL_FUTURE' then v_end_date := greatest(p_start_date, v_today) + 365;
  else v_end_date := p_start_date;
  end if;

  with candidate_dates as (
    select occurrence.duty_date
    from public.duty_slot_occurrence_dates(p_slot_id, p_start_date, v_end_date, p_action = 'WITHDRAW') as occurrence
    where (p_scope <> 'SINGLE' or occurrence.duty_date = p_start_date)
      and ((p_action = 'REGISTER' and not exists (select 1 from public.duty_assignments a where a.profile_id = v_profile_id and a.slot_id = p_slot_id and a.duty_date = occurrence.duty_date))
        or (p_action = 'WITHDRAW' and exists (select 1 from public.duty_assignments a where a.profile_id = v_profile_id and a.slot_id = p_slot_id and a.duty_date = occurrence.duty_date)))
      and (p_scope <> 'UNTIL_DATE' or occurrence.duty_date <= p_until_date)
    order by occurrence.duty_date
  ), selected_dates as (
    select duty_date from candidate_dates limit case when p_scope = 'NEXT_N' then v_count_n else 2147483647 end
  ) select array_agg(duty_date order by duty_date) into v_dates from selected_dates;
  if coalesce(array_length(v_dates, 1), 0) = 0 then raise exception 'No matching future bookings were found.'; end if;

  if p_action = 'REGISTER' then
    foreach v_date in array v_dates loop
      select count(*) into v_registered_count from public.duty_assignments where slot_id = p_slot_id and duty_date = v_date;
      if v_registered_count >= v_slot.max_jps then raise exception 'The slot on % is already full. No bookings were changed.', v_date; end if;
    end loop;
  end if;

  if p_action = 'REGISTER' then
    if p_scope = 'SINGLE' then
      delete from public.recurring_rules where profile_id = v_profile_id and slot_id = p_slot_id and action = 'WITHDRAW' and rule_type = 'NEXT_N' and start_date = p_start_date and count_n = 1;
    else
      delete from public.recurring_rules where profile_id = v_profile_id and slot_id = p_slot_id and action in ('REGISTER', 'WITHDRAW');
      insert into public.recurring_rules (profile_id, slot_id, action, rule_type, start_date, until_date, count_n)
      values (v_profile_id, p_slot_id, 'REGISTER', p_scope::public.rule_type, p_start_date, case when p_scope = 'UNTIL_DATE' then p_until_date else null end, case when p_scope = 'NEXT_N' then v_count_n else null end);
    end if;
    foreach v_date in array v_dates loop
      insert into public.duty_assignments (profile_id, slot_id, duty_date) values (v_profile_id, p_slot_id, v_date) on conflict do nothing;
    end loop;
  else
    foreach v_date in array v_dates loop
      delete from public.duty_assignments where profile_id = v_profile_id and slot_id = p_slot_id and duty_date = v_date;
    end loop;
    if p_scope = 'ALL_FUTURE' then
      delete from public.recurring_rules where profile_id = v_profile_id and slot_id = p_slot_id;
    else
      foreach v_date in array v_dates loop
        delete from public.recurring_rules where profile_id = v_profile_id and slot_id = p_slot_id and action = 'WITHDRAW' and rule_type = 'NEXT_N' and start_date = v_date and count_n = 1;
        insert into public.recurring_rules (profile_id, slot_id, action, rule_type, start_date, until_date, count_n)
        values (v_profile_id, p_slot_id, 'WITHDRAW', 'NEXT_N'::public.rule_type, v_date, null, 1);
      end loop;
    end if;
  end if;
  return jsonb_build_object('action', p_action, 'scope', p_scope, 'affected_count', array_length(v_dates, 1), 'affected_dates', to_jsonb(v_dates));
end;
$$;

create or replace function public.materialize_recurring_duty_assignments(p_horizon_days integer default 365)
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
  v_registered_count integer;
  v_inserted_count integer := 0;
  v_withdrawn_count integer := 0;
begin
  for v_rule in select * from public.recurring_rules order by created_at, id loop
    select slot.*, coalesce(region.timezone, 'Pacific/Auckland') as roster_timezone into v_slot
    from public.duty_slots as slot
    join public.service_desks as desk on desk.id = slot.desk_id
    left join public.regions as region on region.id = desk.region_id
    where slot.id = v_rule.slot_id and slot.status = 'Active' and desk.status = 'Active'
    for update of slot;
    if not found then continue; end if;
    v_today := timezone(v_slot.roster_timezone, now())::date;
    v_now_time := timezone(v_slot.roster_timezone, now())::time;
    v_horizon_date := v_today + least(greatest(coalesce(p_horizon_days, 365), 30), 730);
    for v_date in
      select occurrence.duty_date from public.duty_slot_occurrence_dates(
        v_rule.slot_id, greatest(v_rule.start_date, v_today),
        case when v_rule.rule_type = 'UNTIL_DATE' then least(v_rule.until_date, v_horizon_date) else v_horizon_date end,
        v_rule.action = 'WITHDRAW'
      ) as occurrence
      where occurrence.duty_date > v_today or (occurrence.duty_date = v_today and coalesce(v_slot.end_time, time '00:00') > v_now_time)
      order by occurrence.duty_date
      limit case when v_rule.rule_type = 'NEXT_N' then coalesce(v_rule.count_n, 1) else 2147483647 end
    loop
      if v_rule.action = 'REGISTER' then
        select count(*) into v_registered_count from public.duty_assignments where slot_id = v_rule.slot_id and duty_date = v_date;
        if v_registered_count < v_slot.max_jps then
          insert into public.duty_assignments (profile_id, slot_id, duty_date) values (v_rule.profile_id, v_rule.slot_id, v_date) on conflict do nothing;
          if found then v_inserted_count := v_inserted_count + 1; end if;
        end if;
      elsif v_rule.action = 'WITHDRAW' then
        delete from public.duty_assignments where profile_id = v_rule.profile_id and slot_id = v_rule.slot_id and duty_date = v_date;
        if found then v_withdrawn_count := v_withdrawn_count + 1; end if;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('inserted_assignments', v_inserted_count, 'withdrawn_assignments', v_withdrawn_count);
end;
$$;

revoke all on function public.apply_duty_assignment_change(text, uuid, date, text, integer, date) from public, anon;
grant execute on function public.apply_duty_assignment_change(text, uuid, date, text, integer, date) to authenticated, service_role;
revoke all on function public.materialize_recurring_duty_assignments(integer) from public, anon, authenticated;
grant execute on function public.materialize_recurring_duty_assignments(integer) to service_role;
