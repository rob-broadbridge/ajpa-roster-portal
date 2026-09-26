-- Read-only Stage 2C post-migration verification.
-- The SQL Editor returns one result set with one PASS/FAIL row per check.
with lifecycle_functions as materialized (
  select p.oid, n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as identity_arguments,
    p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as function_definition,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
    has_function_privilege('public', p.oid, 'EXECUTE') as public_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and p.proname in ('get_member_lifecycle_preview','apply_member_lifecycle_transition','update_member_profile_and_role')
), checks(check_name, result) as (
  select 'lifecycle preview function exists and is SECURITY DEFINER', case when exists (select 1 from lifecycle_functions where proname='get_member_lifecycle_preview' and identity_arguments='p_member_id uuid' and prosecdef) then 'PASS' else 'FAIL' end
  union all select 'lifecycle transition function exists and is SECURITY DEFINER', case when exists (select 1 from lifecycle_functions where proname='apply_member_lifecycle_transition' and identity_arguments='p_member_id uuid, p_action text, p_new_role app_role, p_expected_status account_status, p_expected_role app_role' and prosecdef) then 'PASS' else 'FAIL' end
  union all select 'update_member_profile_and_role signature exists', case when to_regprocedure('public.update_member_profile_and_role(uuid,text,text,text,boolean,app_role,account_status,app_role)') is not null then 'PASS' else 'FAIL' end
  union all select 'all lifecycle functions use safe public search_path', case when (select count(*) from lifecycle_functions where prosecdef and 'search_path=public'=any(coalesce(proconfig,array[]::text[])))=3 then 'PASS' else 'FAIL' end
  union all select 'lifecycle RPC execute privileges are controlled', case when (select count(*) from lifecycle_functions where authenticated_execute and not anon_execute and not public_execute)=3 then 'PASS' else 'FAIL' end
  union all select 'direct authenticated profile status update is protected', case when not has_column_privilege('authenticated','public.profiles','status','UPDATE') then 'PASS' else 'FAIL' end
  union all select 'direct authenticated profile role update is protected', case when not has_column_privilege('authenticated','public.profiles','role','UPDATE') then 'PASS' else 'FAIL' end
  union all select 'safe profile update columns remain available', case when has_column_privilege('authenticated','public.profiles','full_name','UPDATE') and has_column_privilege('authenticated','public.profiles','phone','UPDATE') and has_column_privilege('authenticated','public.profiles','warrant_number','UPDATE') and has_column_privilege('authenticated','public.profiles','is_provisional','UPDATE') then 'PASS' else 'FAIL' end
  union all select 'duty_assignment_cancellations structure exists', case when to_regclass('public.duty_assignment_cancellations') is not null and (select count(*) from information_schema.columns where table_schema='public' and table_name='duty_assignment_cancellations' and column_name in ('profile_id','slot_id','duty_date','reason','cancelled_at','cancelled_by'))=6 then 'PASS' else 'FAIL' end
  union all select 'assignment cancellation primary/unique/index design exists', case when exists (select 1 from pg_constraint where conrelid='public.duty_assignment_cancellations'::regclass and contype='p') and exists (select 1 from pg_constraint where conrelid='public.duty_assignment_cancellations'::regclass and contype='u' and pg_get_constraintdef(oid) like '%profile_id%slot_id%duty_date%') and exists (select 1 from pg_indexes where schemaname='public' and tablename='duty_assignment_cancellations') then 'PASS' else 'FAIL' end
  union all select 'duty_cancellations remains separate', case when to_regclass('public.duty_cancellations') is not null and to_regclass('public.duty_assignment_cancellations') is not null and 'public.duty_cancellations'::regclass <> 'public.duty_assignment_cancellations'::regclass then 'PASS' else 'FAIL' end
  union all select 'last Registrar protection and advisory lock exist', case when (select count(*) from lifecycle_functions where proname in ('apply_member_lifecycle_transition','update_member_profile_and_role') and function_definition like '%last approved Registrar%' and function_definition like '%pg_advisory_xact_lock%')=2 then 'PASS' else 'FAIL' end
  union all select 'duty_assignment_cancellations RLS is enabled', case when (select relrowsecurity from pg_class where oid='public.duty_assignment_cancellations'::regclass) then 'PASS' else 'FAIL' end
  union all select 'roster_activity_audit RLS is enabled', case when (select relrowsecurity from pg_class where oid='public.roster_activity_audit'::regclass) then 'PASS' else 'FAIL' end
  union all select 'service_desks RLS is enabled', case when (select relrowsecurity from pg_class where oid='public.service_desks'::regclass) then 'PASS' else 'FAIL' end
  union all select 'Stage 2C audit status/role columns exist', case when (select count(*) from information_schema.columns where table_schema='public' and table_name='roster_activity_audit' and column_name in ('previous_status','new_status','previous_role','new_role'))=4 then 'PASS' else 'FAIL' end
  union all select 'required lifecycle and audit triggers exist', case when (select count(*) from pg_trigger where not tgisinternal and tgname in ('service_desks_validate_administrators','audit_duty_assignment_activity','audit_recurring_rule_activity'))=3 then 'PASS' else 'FAIL' end
  union all select 'Approved Admin-only desk validation and vacancies', case when pg_get_functiondef('public.validate_service_desk_administrators()'::regprocedure) like '%status=''Approved'' and role=''Admin''%' and pg_get_functiondef('public.validate_service_desk_administrators()'::regprocedure) like '%is not null%' and (select is_nullable from information_schema.columns where table_schema='public' and table_name='service_desks' and column_name='primary_admin_id')='YES' and (select is_nullable from information_schema.columns where table_schema='public' and table_name='service_desks' and column_name='secondary_admin_id')='YES' then 'PASS' else 'FAIL' end
)
select check_name, result
from checks
order by check_name;
