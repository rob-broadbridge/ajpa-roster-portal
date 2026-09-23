-- Read-only deployment inspection. Does not impersonate users, mutate records,
-- invoke workers, send email or replace controlled authenticated testing.
begin read only;

select p.oid::regprocedure as function_signature, p.prosecdef as security_definer,
  p.proconfig as function_settings,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'is_approved_member','update_pending_profile','update_my_profile',
  'get_roster_member_directory_for_current_user','save_duty_statistic_for_member',
  'delete_duty_statistic_for_member','get_roster_activity_audit_for_current_user',
  'get_incomplete_duty_statistics_for_current_user','is_duty_slot_holiday')
order by p.oid::regprocedure::text;

-- Expect 17 restrictive policies, excluding profiles. Existing row scopes remain.
select tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public'
  and (policyname='stage2a_approved_actor' or tablename in ('profiles','roster_activity_audit','statutory_holidays'))
order by tablename,policyname;

-- Anon/authenticated audit flags must be false; service-role access stays true.
select role_name,
  has_table_privilege(role_name,'public.roster_activity_audit','SELECT') as audit_table_select,
  has_any_column_privilege(role_name,'public.roster_activity_audit','SELECT') as audit_column_select
from (values ('anon'),('authenticated'),('service_role')) r(role_name);

-- Inspect the final bodies; expect only own Pending fields and scoped audit reads.
select pg_get_functiondef('public.update_pending_profile(text,text,text,boolean)'::regprocedure);
select pg_get_functiondef('public.get_roster_activity_audit_for_current_user(integer,date,date)'::regprocedure);
rollback;
