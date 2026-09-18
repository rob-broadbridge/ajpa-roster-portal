-- Stage 22 verification: Home Based Service is present internally, but it is
-- marked for exclusion from Roster and Service Desk portal views.

select id, code, name, status, is_home_based_service
from public.service_desks
where is_home_based_service;

-- Expected: one row.
select p.oid::regprocedure as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_home_based_duty_statistic'
  and p.oid::regprocedure::text = 'save_home_based_duty_statistic(uuid,date,time without time zone,jsonb)';
