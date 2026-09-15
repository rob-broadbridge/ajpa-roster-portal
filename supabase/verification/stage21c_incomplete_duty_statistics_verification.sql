-- Stage 21C: run while signed in as a Registrar or assigned Desk Admin.
-- It returns only completed, registered shifts that do not yet have statistics.
select * from public.get_incomplete_duty_statistics_for_current_user();

-- The anonymous role must not be able to call the staff-only function.
select has_function_privilege(
  'anon',
  'public.get_incomplete_duty_statistics_for_current_user()'::regprocedure,
  'execute'
) as anonymous_can_view_incomplete_statistics;
