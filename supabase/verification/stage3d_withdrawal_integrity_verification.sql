-- Read-only Stage 3D deployment verification.
select to_regclass('public.recurring_withdrawal_requests') is not null as withdrawal_request_table_exists;
select to_regclass('public.recurring_withdrawal_overrides') is not null as withdrawal_override_table_exists;
select to_regprocedure('public.apply_duty_assignment_change(text,uuid,date,text,integer,date)') is not null as member_withdrawal_rpc_exists;
select to_regprocedure('public.apply_duty_assignment_change_for_member(uuid,text,uuid,date)') is not null as administrative_withdrawal_rpc_exists;
select to_regprocedure('public.apply_member_lifecycle_transition(uuid,text,app_role,account_status,app_role)') is not null as archive_lifecycle_rpc_exists;
select exists(select 1 from pg_trigger where tgname='preserve_recurring_rule_history_before_delete') as global_archive_delete_trigger_absent;
select count(*) as legacy_withdrawal_rules from public.recurring_rules where action='WITHDRAW';
select count(*) as active_rule_overlap_groups from (select profile_id,slot_id,count(*) from public.recurring_rules where lifecycle_status='ACTIVE' group by profile_id,slot_id having count(*)>1) q;
select count(*) as orphaned_outcome_rules from public.recurring_occurrence_outcomes o left join public.recurring_rules r on r.id=o.recurring_rule_id where r.id is null;
select has_function_privilege('authenticated','public.apply_duty_assignment_change(text,uuid,date,text,integer,date)','execute') as member_rpc_granted;
select has_function_privilege('authenticated','public.apply_duty_assignment_change_for_member(uuid,text,uuid,date)','execute') as admin_rpc_granted;
