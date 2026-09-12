-- Stage 2B verification: safe to run in Supabase SQL Editor.
-- Browser roles must be unable to write either table, while signed-in members
-- can use the one approved atomic booking procedure.

select
  table_name as check_name,
  has_table_privilege('anon', format('public.%I', table_name), 'insert') as anon_can_insert,
  has_table_privilege('authenticated', format('public.%I', table_name), 'insert') as signed_in_can_insert,
  has_table_privilege('authenticated', format('public.%I', table_name), 'update') as signed_in_can_update,
  has_table_privilege('authenticated', format('public.%I', table_name), 'delete') as signed_in_can_delete,
  has_table_privilege('authenticated', format('public.%I', table_name), 'select') as signed_in_can_select,
  null::boolean as signed_in_can_use_atomic_booking_action
from (values ('duty_assignments'), ('recurring_rules')) as tables(table_name)

union all

select
  'apply_duty_assignment_change()' as check_name,
  null::boolean,
  null::boolean,
  null::boolean,
  null::boolean,
  null::boolean,
  has_function_privilege(
    'authenticated',
    'public.apply_duty_assignment_change(text, uuid, date, text, integer, date)'::regprocedure,
    'execute'
  );
