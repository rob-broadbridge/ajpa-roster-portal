-- Stage 21 verification: run after 20260915_desk_maintenance_on_behalf_actions.sql.

-- Every active and archived Service Desk must have a Primary Desk Admin.
select id, code, name, primary_admin_id
from public.service_desks
where primary_admin_id is null;

-- These database safeguards and staff-only actions should all be present.
select procedure.proname as function_name
from pg_proc as procedure
join pg_namespace as namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'apply_duty_assignment_change_for_member',
    'create_service_desk_for_current_user',
    'delete_duty_statistic_for_member',
    'get_roster_activity_audit_for_current_user',
    'save_duty_statistic_for_member',
    'validate_service_desk_administrators'
  )
order by function_name;

select trigger_name, event_manipulation, action_timing
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'service_desks'
  and trigger_name = 'service_desks_validate_administrators';
