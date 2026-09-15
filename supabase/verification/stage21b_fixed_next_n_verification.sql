-- Stage 21B: confirm that the materialiser no longer slides NEXT_N forward.
-- Run after 20260915_fix_region_aware_next_n_materialisation.sql.

select pg_get_functiondef(
  'public.materialize_recurring_duty_assignments(integer)'::regprocedure
) ilike '%v_series_start_date := v_rule.start_date%'
  as next_n_is_anchored_to_its_original_start_date;

-- Operational check for the reported booking. It should show the two historic
-- confirmation rows already sent, but no new rows after this patch is applied.
select
  notification.created_at at time zone 'Pacific/Auckland' as created_auckland,
  notification.status,
  notification.confirmation_sent_at at time zone 'Pacific/Auckland' as confirmation_sent_auckland,
  notification.duty_date
from public.duty_assignment_notifications as notification
join public.profiles as member on member.id = notification.profile_id
join public.duty_slots as slot on slot.id = notification.slot_id
join public.service_desks as desk on desk.id = slot.desk_id
where lower(member.email) = 'mike.cameron@xtra.co.nz'
  and desk.name = 'Panmure Library'
  and notification.duty_date = date '2026-09-20'
order by notification.created_at;
