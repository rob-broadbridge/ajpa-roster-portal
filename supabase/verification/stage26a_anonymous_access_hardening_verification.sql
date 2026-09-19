-- Stage 2A verification.  Run each block separately in Supabase SQL Editor.

-- Block 1: expected result is no rows.  No portal table should be available
-- to the anonymous role, including via a grant made to PUBLIC.
with portal_tables(table_name) as (
  values
    ('desk_admin_monthly_statistics_reports'), ('desk_admin_reminder_deliveries'),
    ('desk_follows'), ('duty_assignment_notifications'), ('duty_assignments'),
    ('duty_cancellations'), ('duty_slot_holiday_overrides'), ('duty_slots'),
    ('duty_statistics'), ('duty_statistics_reminder_settings'),
    ('duty_statistics_reminders'), ('profiles'), ('recurring_rules'), ('regions'),
    ('roster_activity_audit'), ('service_desks'), ('statutory_holidays'), ('user_preferences')
), operations(privilege_name) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
)
select table_name, privilege_name
from portal_tables cross join operations
where has_table_privilege('anon', 'public.' || table_name, privilege_name)
order by table_name, privilege_name;

-- Block 2: expected values are false / false / true for both worker rows.
select
  p.oid::regprocedure as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'invoke_duty_statistics_reminder_processor',
    'invoke_monthly_duty_statistics_report_processor'
  )
order by function_name;

-- Block 3: expected anon_can_execute is false for every row.  The profile
-- functions and is_manager remain available to authenticated users only.
select
  p.oid::regprocedure as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'update_my_profile', 'is_manager', 'audit_roster_activity', 'handle_new_user',
    'notify_member_on_profile_approval', 'notify_registrars_of_new_profile',
    'prevent_holiday_duty_assignment', 'queue_duty_assignment_notification',
    'send_calendar_invite_on_duty_assignment', 'sync_profile_email_from_auth',
    'validate_service_desk_administrators', 'register_for_duty'
  )
order by function_name;
