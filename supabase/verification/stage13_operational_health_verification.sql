-- Stage 13 verification: browser roles must not access the operational-health
-- summary anonymously, while signed-in users may call it and the function
-- itself enforces the Registrar role.

select
  has_function_privilege('anon', 'public.get_roster_operational_health()'::regprocedure, 'execute') as anonymous_can_execute,
  has_function_privilege('authenticated', 'public.get_roster_operational_health()'::regprocedure, 'execute') as signed_in_can_execute,
  has_function_privilege('service_role', 'public.get_roster_operational_health()'::regprocedure, 'execute') as service_role_can_execute;
