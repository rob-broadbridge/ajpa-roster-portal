-- Stage 2 security assurance audit (READ ONLY)
--
-- Run EACH numbered block separately in the Supabase SQL Editor. This gives
-- each result its own grid rather than showing only the final result.
-- No block changes data, policies, functions, or scheduled jobs.

-- 1. RLS coverage: application tables should normally show rls_enabled = true.
-- Investigate any false value before go-live. Views are deliberately excluded.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

-- 2. Policies: review that every RLS-enabled table has the expected policies.
-- A table missing from this list either has no policies or has RLS disabled.
select tablename,
       policyname,
       roles,
       cmd,
       qual as using_expression,
       with_check as check_expression
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. SECURITY DEFINER functions: public_execute and anon_can_execute must be
-- false for every row. authenticated_can_execute is expected only for
-- deliberately browser-callable portal functions.
select p.oid::regprocedure as function_name,
       exists (
         select 1
         from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
         where privilege.grantee = 0
           and privilege.privilege_type = 'EXECUTE'
       ) as public_execute,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.oid::regprocedure::text;

-- 4. Direct browser table access: review access granted to anonymous and
-- signed-in users. Browser writes to roster records should be false because
-- authorised RPC functions perform those changes atomically.
select c.relname as table_name,
       has_table_privilege('anon', c.oid, 'select') as anon_select,
       has_table_privilege('anon', c.oid, 'insert') as anon_insert,
       has_table_privilege('anon', c.oid, 'update') as anon_update,
       has_table_privilege('anon', c.oid, 'delete') as anon_delete,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'insert') as authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'update') as authenticated_update,
       has_table_privilege('authenticated', c.oid, 'delete') as authenticated_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

-- 5. Views: security_invoker should be true for any view exposed to browser
-- roles. False is not automatically unsafe, but requires intentional review.
select c.relname as view_name,
       coalesce((c.reloptions::text[] @> array['security_invoker=true']), false) as security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
order by c.relname;

-- 6. Required scheduled processes. All should be active. The last-run status
-- is the database scheduler call, not the downstream email-provider result.
select expected.jobname,
       job.schedule,
       coalesce(job.active, false) as active,
       latest.status as last_run_status,
       latest.start_time as last_started_at,
       latest.return_message as last_message
from (values
  ('ajpa-duty-notification-processor-minute'),
  ('ajpa-desk-admin-reminders-quarter-hourly'),
  ('ajpa-recurring-assignment-materialiser-daily'),
  ('ajpa-duty-statistics-reminder-processor-minute'),
  ('ajpa-monthly-duty-statistics-report-processor-minute')
) as expected(jobname)
left join cron.job job on job.jobname = expected.jobname
left join lateral (
  select run.status, run.start_time, run.return_message
  from cron.job_run_details run
  where run.jobid = job.jobid
  order by run.start_time desc
  limit 1
) latest on true
order by expected.jobname;

-- 7. Sensitive delivery queues: only the service role should normally have
-- direct table access. RLS must be enabled (see block 1).
select c.relname as queue_table,
       has_table_privilege('anon', c.oid, 'select') as anon_select,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
       has_table_privilege('service_role', c.oid, 'select') as service_role_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'duty_assignment_notifications',
    'desk_admin_reminder_deliveries',
    'duty_statistics_reminders',
    'desk_admin_monthly_statistics_reports'
  )
order by c.relname;
