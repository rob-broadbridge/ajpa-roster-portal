-- Stage 2 verification: safe to run in Supabase SQL Editor after the Stage 2
-- migration. The three result sets confirm the protected booking function,
-- the rolling materialisation job, and the shared persisted assignments.

select
  p.oid::regprocedure as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'apply_duty_assignment_change',
    'materialize_recurring_duty_assignments',
    'duty_slot_occurrence_dates'
  )
order by function_name;

select jobname, schedule, active
from cron.job
where jobname = 'ajpa-recurring-assignment-materialiser-daily';

select
  rule.action,
  rule.rule_type,
  count(*) as rules,
  count(assignment.profile_id) as materialised_assignments
from public.recurring_rules as rule
left join public.duty_assignments as assignment
  on assignment.profile_id = rule.profile_id
  and assignment.slot_id = rule.slot_id
  and assignment.duty_date >= rule.start_date
group by rule.action, rule.rule_type
order by rule.action, rule.rule_type;
