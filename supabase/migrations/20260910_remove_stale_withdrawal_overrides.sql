-- Repair historic cases where a JP withdrew from one occurrence and then
-- registered for that exact occurrence again. The assignment is present, but
-- the old one-occurrence WITHDRAW rule still hides it in the application.
-- Only remove a rule when a matching current assignment proves it is stale.

delete from public.recurring_rules as rule
where rule.action = 'WITHDRAW'
  and rule.rule_type = 'NEXT_N'
  and rule.count_n = 1
  and exists (
    select 1
    from public.duty_assignments as assignment
    where assignment.profile_id = rule.profile_id
      and assignment.slot_id = rule.slot_id
      and assignment.duty_date = rule.start_date
  );
