-- Stage 3A: durable recurring-occurrence outcomes and calendar semantics.
-- This migration deliberately does not change booking/materialisation behaviour.

begin;

do $$
begin
  if not exists (
    select 1 from pg_type as t
    join pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'recurring_occurrence_outcome'
  ) then
    create type public.recurring_occurrence_outcome as enum (
      'BOOKED', 'FULL', 'STATUTORY_HOLIDAY', 'DESK_CLOSED',
      'MEMBER_INELIGIBLE', 'OTHER_UNAVAILABLE', 'WITHDRAWN'
    );
  end if;
end;
$$;

alter table public.recurring_rules
  add column if not exists lifecycle_status text not null default 'ACTIVE',
  add column if not exists superseded_by uuid,
  add column if not exists superseded_at timestamptz,
  add column if not exists ended_at timestamptz;

alter table public.recurring_rules
  drop constraint if exists recurring_rules_lifecycle_status_check;
alter table public.recurring_rules
  add constraint recurring_rules_lifecycle_status_check
  check (lifecycle_status in ('ACTIVE', 'SUPERSEDED', 'ENDED'));

alter table public.recurring_rules
  drop constraint if exists recurring_rules_superseded_by_fkey;
alter table public.recurring_rules
  add constraint recurring_rules_superseded_by_fkey
  foreign key (superseded_by) references public.recurring_rules(id) on delete restrict;

do $$
begin
  if exists (
    select 1 from public.recurring_rules
    where action = 'REGISTER' and lifecycle_status = 'ACTIVE'
    group by profile_id, slot_id having count(*) > 1
  ) then
    raise exception 'Stage 3A preflight failed: duplicate active REGISTER recurring rules exist; resolve them before migration.';
  end if;
end;
$$;

create unique index if not exists recurring_rules_one_active_register_per_member_slot_idx
  on public.recurring_rules (profile_id, slot_id)
  where action = 'REGISTER' and lifecycle_status = 'ACTIVE';

create index if not exists recurring_rules_superseded_by_idx
  on public.recurring_rules (superseded_by) where superseded_by is not null;

create table if not exists public.recurring_occurrence_outcomes (
  id uuid primary key default gen_random_uuid(),
  recurring_rule_id uuid not null references public.recurring_rules(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  slot_id uuid not null references public.duty_slots(id) on delete restrict,
  duty_date date not null,
  outcome public.recurring_occurrence_outcome not null,
  booking_created boolean,
  processed_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_occurrence_outcomes_one_per_rule_date unique (recurring_rule_id, duty_date),
  constraint recurring_occurrence_outcomes_booking_source_check check (outcome <> 'BOOKED' or booking_created is not null)
);

create index if not exists recurring_occurrence_outcomes_member_slot_date_idx
  on public.recurring_occurrence_outcomes (profile_id, slot_id, duty_date);
create index if not exists recurring_occurrence_outcomes_exception_idx
  on public.recurring_occurrence_outcomes (profile_id, outcome, processed_at)
  where outcome <> 'BOOKED';

comment on table public.recurring_occurrence_outcomes is
  'One durable outcome per recurring rule and scheduled calendar occurrence. Delivery state belongs to a later notification layer.';
comment on column public.recurring_occurrence_outcomes.booking_created is
  'For BOOKED outcomes, distinguishes a newly-created assignment from an existing legitimate booking; an existing booking is not an exception.';

alter table public.recurring_occurrence_outcomes enable row level security;
revoke all on table public.recurring_occurrence_outcomes from public, anon, authenticated;
grant select, insert, update on table public.recurring_occurrence_outcomes to service_role;

-- Calendar generation is independent of holidays, capacity, closure and
-- member eligibility. Existing callers retain the old helper until 3B/3C.
create or replace function public.scheduled_duty_slot_occurrence_dates(
  p_slot_id uuid, p_start_date date, p_end_date date
)
returns table(duty_date date)
language sql stable security definer set search_path = public
as $$
  select generated_day::date
  from public.duty_slots as slot
  join public.service_desks as desk on desk.id = slot.desk_id
  cross join lateral generate_series(
    greatest(p_start_date, slot.effective_from), p_end_date, interval '1 day'
  ) as generated_day
  where slot.id = p_slot_id
    and slot.status = 'Active' and desk.status = 'Active'
    and p_start_date is not null and p_end_date is not null
    and p_start_date <= p_end_date
    and extract(dow from generated_day)::integer = slot.day_of_week
  order by generated_day::date;
$$;

revoke all on function public.scheduled_duty_slot_occurrence_dates(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.scheduled_duty_slot_occurrence_dates(uuid, date, date)
  to service_role;

commit;
