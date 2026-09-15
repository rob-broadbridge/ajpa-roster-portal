-- Stage 21A verification: this should return true.
select has_function_privilege(
  'authenticated',
  'public.save_duty_statistic_for_member(uuid,uuid,uuid,date,jsonb)'::regprocedure,
  'execute'
) as authenticated_can_save_member_statistics;

-- Functional test in the portal: as a Registrar, save Michael Cameron's
-- Glen Innes Library statistics for 07-09-2026. Refresh afterwards: the
-- record should remain visible in Statistics.
