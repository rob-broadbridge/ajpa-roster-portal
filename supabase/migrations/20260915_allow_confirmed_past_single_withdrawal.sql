-- Stage 20: an approved member may correct a completed shift with an explicit,
-- single-slot withdrawal. Historical changes never create recurring rules or
-- email/calendar notifications.

create or replace function public.queue_duty_assignment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_start_time time;
  slot_end_time time;
  minimum_jps integer;
  slot_timezone text;
  remaining_jps integer;
  local_now timestamp;
  alert_required boolean := false;
begin
  if tg_op = 'INSERT' then
    select slot.end_time, coalesce(region.timezone, 'Pacific/Auckland')
      into slot_end_time, slot_timezone
    from public.duty_slots as slot
    join public.service_desks as desk on desk.id = slot.desk_id
    left join public.regions as region on region.id = desk.region_id
    where slot.id = new.slot_id;

    if slot_end_time is not null
      and new.duty_date + slot_end_time <= timezone(coalesce(slot_timezone, 'Pacific/Auckland'), now()) then
      return new;
    end if;

    insert into public.duty_assignment_notifications (
      profile_id, slot_id, duty_date, status, confirmation_due_at, next_attempt_at
    ) values (
      new.profile_id, new.slot_id, new.duty_date,
      'PENDING_CONFIRMATION', now() + interval '5 minutes', now() + interval '5 minutes'
    );
    return new;
  end if;

  select slot.start_time, slot.end_time, slot.min_jps, coalesce(region.timezone, 'Pacific/Auckland')
    into slot_start_time, slot_end_time, minimum_jps, slot_timezone
  from public.duty_slots as slot
  join public.service_desks as desk on desk.id = slot.desk_id
  left join public.regions as region on region.id = desk.region_id
  where slot.id = old.slot_id;

  local_now := timezone(slot_timezone, now());
  -- A completed shift is historical data. Do not create a late cancellation
  -- email, nor alert Desk Admins after the duty has already ended.
  if slot_end_time is not null and old.duty_date + slot_end_time <= local_now then
    return old;
  end if;

  select count(*) into remaining_jps
  from public.duty_assignments
  where slot_id = old.slot_id and duty_date = old.duty_date;

  alert_required := slot_start_time is not null
    and old.duty_date + slot_start_time > local_now
    and old.duty_date + slot_start_time <= local_now + interval '7 days'
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
  v_shift_finished boolean;
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
  v_shift_finished := p_start_date < v_today
    or (p_start_date = v_today and coalesce(v_slot.end_time, time '00:00') <= v_now_time);
  if v_shift_finished and p_scope <> 'SINGLE' then
    raise exception 'Only a single past shift can be changed.';
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
  if coalesce(array_length(v_dates, 1), 0) = 0 then raise exception 'No matching bookings were found.'; end if;

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
        -- A historical single withdrawal never needs a materialisation
        -- override: it must not leave behind a recurring-rule record.
        if not v_shift_finished then
          delete from public.recurring_rules where profile_id = v_profile_id and slot_id = p_slot_id and action = 'WITHDRAW' and rule_type = 'NEXT_N' and start_date = v_date and count_n = 1;
          insert into public.recurring_rules (profile_id, slot_id, action, rule_type, start_date, until_date, count_n)
          values (v_profile_id, p_slot_id, 'WITHDRAW', 'NEXT_N'::public.rule_type, v_date, null, 1);
        end if;
      end loop;
    end if;
  end if;
  return jsonb_build_object('action', p_action, 'scope', p_scope, 'affected_count', array_length(v_dates, 1), 'affected_dates', to_jsonb(v_dates));
end;
$$;

revoke all on function public.apply_duty_assignment_change(text, uuid, date, text, integer, date)
  from public, anon;
grant execute on function public.apply_duty_assignment_change(text, uuid, date, text, integer, date)
  to authenticated;
