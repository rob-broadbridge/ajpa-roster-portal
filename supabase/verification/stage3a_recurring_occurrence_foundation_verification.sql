-- Stage 3A read-only verification. Run after the migration.
with checks as (
  select 'recurring occurrence outcome table exists' check_name, case when to_regclass('public.recurring_occurrence_outcomes') is not null then 'PASS' else 'FAIL' end result
  union all select 'recurring occurrence outcome type exists', case when exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname='recurring_occurrence_outcome') then 'PASS' else 'FAIL' end
  union all select 'one outcome per recurring rule/date constraint exists', case when exists (select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='recurring_occurrence_outcomes' and c.conname='recurring_occurrence_outcomes_one_per_rule_date') then 'PASS' else 'FAIL' end
  union all select 'active REGISTER uniqueness index exists', case when exists (select 1 from pg_indexes where schemaname='public' and indexname='recurring_rules_one_active_register_per_member_slot_idx') then 'PASS' else 'FAIL' end
  union all select 'recurring rule lifecycle columns exist', case when (select count(*) from information_schema.columns where table_schema='public' and table_name='recurring_rules' and column_name in ('lifecycle_status','superseded_by','superseded_at','ended_at'))=4 then 'PASS' else 'FAIL' end
  union all select 'scheduled calendar occurrence helper exists', case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='scheduled_duty_slot_occurrence_dates' and p.prokind='f' and pg_get_function_identity_arguments(p.oid)='p_slot_id uuid, p_start_date date, p_end_date date') then 'PASS' else 'FAIL' end
  union all select 'outcome table RLS is enabled', case when exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='recurring_occurrence_outcomes' and c.relrowsecurity) then 'PASS' else 'FAIL' end
  union all select 'outcome table direct authenticated writes are revoked', case when not has_table_privilege('authenticated','public.recurring_occurrence_outcomes','INSERT') and not has_table_privilege('authenticated','public.recurring_occurrence_outcomes','UPDATE') then 'PASS' else 'FAIL' end
)
select check_name, result from checks order by check_name;
