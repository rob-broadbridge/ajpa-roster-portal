-- Read-only Stage 17 verification.
-- Shows the fixed, original occurrence series for every active NEXT_N rule.
-- The date list must not move forward as the scheduled materialiser runs.

with fixed_next_n_dates as (
  select
    profile.full_name as jp_member,
    desk.name as service_desk,
    slot.start_time,
    slot.end_time,
    rule.action,
    rule.start_date,
    rule.count_n,
    occurrence.duty_date
  from public.recurring_rules as rule
  join public.profiles as profile on profile.id = rule.profile_id
  join public.duty_slots as slot on slot.id = rule.slot_id
  join public.service_desks as desk on desk.id = slot.desk_id
  cross join lateral (
    select duty_date
    from public.duty_slot_occurrence_dates(
      rule.slot_id,
      rule.start_date,
      rule.start_date + 730,
      rule.action = 'WITHDRAW'
    )
    order by duty_date
    limit least(greatest(coalesce(rule.count_n, 1), 1), 52)
  ) as occurrence
  where rule.rule_type = 'NEXT_N'
)
select
  jp_member,
  service_desk,
  start_time,
  end_time,
  action,
  start_date,
  count_n,
  array_agg(duty_date order by duty_date) as fixed_occurrence_dates
from fixed_next_n_dates
group by
  jp_member,
  service_desk,
  start_time,
  end_time,
  action,
  start_date,
  count_n
order by jp_member, service_desk, action;
