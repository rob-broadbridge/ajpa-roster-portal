-- Roster activity audit trail. This is intentionally limited to booking and
-- withdrawal activity so that unusual roster changes can be investigated.

create table if not exists public.roster_activity_audit (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  subject_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  duty_slot_id uuid references public.duty_slots(id) on delete set null,
  duty_date date,
  rule_action text,
  rule_type text,
  rule_start_date date,
  rule_until_date date,
  rule_count_n integer,
  desk_code_snapshot text,
  desk_name_snapshot text,
  start_time_snapshot time,
  end_time_snapshot time
);

create index if not exists roster_activity_audit_occurred_at_idx
  on public.roster_activity_audit (occurred_at desc);

create index if not exists roster_activity_audit_subject_idx
  on public.roster_activity_audit (subject_profile_id, occurred_at desc);

create or replace function public.audit_roster_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_actor_id uuid := auth.uid();
  activity_subject_id uuid;
  activity_slot_id uuid;
  activity_date date;
  activity_rule_action text;
  activity_rule_type text;
  activity_rule_start date;
  activity_rule_until date;
  activity_rule_count integer;
  snapshot_desk_code text;
  snapshot_desk_name text;
  snapshot_start_time time;
  snapshot_end_time time;
begin
  if tg_table_name = 'duty_assignments' then
    activity_subject_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    activity_slot_id := case when tg_op = 'DELETE' then old.slot_id else new.slot_id end;
    activity_date := case when tg_op = 'DELETE' then old.duty_date else new.duty_date end;
  elsif tg_table_name = 'recurring_rules' then
    activity_subject_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
    activity_slot_id := case when tg_op = 'DELETE' then old.slot_id else new.slot_id end;
    activity_rule_action := case when tg_op = 'DELETE' then old.action else new.action end;
    activity_rule_type := case when tg_op = 'DELETE' then old.rule_type else new.rule_type end;
    activity_rule_start := case when tg_op = 'DELETE' then old.start_date else new.start_date end;
    activity_rule_until := case when tg_op = 'DELETE' then old.until_date else new.until_date end;
    activity_rule_count := case when tg_op = 'DELETE' then old.count_n else new.count_n end;
    activity_date := activity_rule_start;
  else
    raise exception 'Unexpected audit trigger table: %', tg_table_name;
  end if;

  select desk.code, desk.name, slot.start_time, slot.end_time
  into snapshot_desk_code, snapshot_desk_name, snapshot_start_time, snapshot_end_time
  from public.duty_slots slot
  join public.service_desks desk on desk.id = slot.desk_id
  where slot.id = activity_slot_id;

  insert into public.roster_activity_audit (
    actor_profile_id, subject_profile_id, event_type, duty_slot_id, duty_date,
    rule_action, rule_type, rule_start_date, rule_until_date, rule_count_n,
    desk_code_snapshot, desk_name_snapshot, start_time_snapshot, end_time_snapshot
  ) values (
    activity_actor_id,
    activity_subject_id,
    case
      when tg_table_name = 'duty_assignments' and tg_op = 'INSERT' then 'DUTY_REGISTERED'
      when tg_table_name = 'duty_assignments' and tg_op = 'DELETE' then 'DUTY_WITHDRAWN'
      when tg_table_name = 'recurring_rules' and tg_op = 'INSERT' then 'RULE_CREATED'
      else 'RULE_DELETED'
    end,
    activity_slot_id, activity_date,
    activity_rule_action, activity_rule_type, activity_rule_start,
    activity_rule_until, activity_rule_count,
    snapshot_desk_code, snapshot_desk_name, snapshot_start_time, snapshot_end_time
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_duty_assignment_activity on public.duty_assignments;
create trigger audit_duty_assignment_activity
after insert or delete on public.duty_assignments
for each row execute function public.audit_roster_activity();

drop trigger if exists audit_recurring_rule_activity on public.recurring_rules;
create trigger audit_recurring_rule_activity
after insert or delete on public.recurring_rules
for each row execute function public.audit_roster_activity();

alter table public.roster_activity_audit enable row level security;

drop policy if exists roster_activity_audit_admin_read on public.roster_activity_audit;
create policy roster_activity_audit_admin_read
on public.roster_activity_audit for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.status = 'Approved'
      and profiles.role in ('Admin', 'Registrar')
  )
);

revoke all on public.roster_activity_audit from anon, authenticated;
grant select on public.roster_activity_audit to authenticated;
