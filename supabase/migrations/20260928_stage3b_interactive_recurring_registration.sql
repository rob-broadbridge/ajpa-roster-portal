-- Stage 3B: transactional interactive recurring registration with durable outcomes.
begin;

create table if not exists public.recurring_registration_requests (
  request_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  slot_id uuid not null references public.duty_slots(id) on delete restrict,
  recurring_rule_id uuid not null references public.recurring_rules(id) on delete restrict,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.recurring_registration_requests enable row level security;
revoke all on table public.recurring_registration_requests from public, anon, authenticated;
grant select, insert on table public.recurring_registration_requests to service_role;

create or replace function public.apply_recurring_registration(
  p_slot_id uuid, p_start_date date, p_scope text,
  p_count_n integer default null, p_until_date date default null,
  p_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid := auth.uid(); v_slot record; v_existing record; v_old_rule uuid; v_rule_id uuid;
  v_request jsonb; v_end date; v_date date; v_dates date[]; v_registered integer; v_reason text; v_outcome_id uuid;
  v_new integer := 0; v_already integer := 0; v_exceptions integer := 0; v_occurrences jsonb := '[]'::jsonb;
begin
  -- Request-level validity is checked before calendar processing: an inactive
  -- desk/slot or unapproved member invalidates the instruction itself. The
  -- occurrence-level outcome categories DESK_CLOSED, MEMBER_INELIGIBLE and
  -- OTHER_UNAVAILABLE remain reserved for later materialisation states and
  -- are not fabricated for an invalid recurring request here.
  if v_profile_id is null then raise exception 'You must be signed in to change a roster booking.'; end if;
  if not exists (select 1 from profiles where id=v_profile_id and status='Approved') then raise exception 'Your account is not approved for roster bookings.'; end if;
  if p_request_id is null then raise exception 'A request id is required.'; end if;
  p_scope := upper(coalesce(p_scope,''));
  if p_scope not in ('NEXT_N','UNTIL_DATE','ALL_FUTURE') then raise exception 'Recurring registration scope is not valid.'; end if;
  if p_start_date is null then raise exception 'A booking start date is required.'; end if;
  if p_scope='NEXT_N' and (p_count_n is null or p_count_n < 1 or p_count_n > 52) then raise exception 'NEXT_N must be between 1 and 52.'; end if;
  if p_scope='UNTIL_DATE' and (p_until_date is null or p_until_date < p_start_date or p_until_date > p_start_date+730) then raise exception 'UNTIL_DATE must be within 730 days of the start date.'; end if;
  select result into v_request from recurring_registration_requests where request_id=p_request_id and profile_id=v_profile_id for update;
  if found then return v_request; end if;
  perform pg_advisory_xact_lock(hashtextextended('ajpa-stage3b-recurring-registration:'||v_profile_id||':'||p_slot_id,0));
  select result into v_request from recurring_registration_requests where request_id=p_request_id and profile_id=v_profile_id for update;
  if found then return v_request; end if;
  select slot.*, desk.status as desk_status, slot.status as slot_status into v_slot from duty_slots slot join service_desks desk on desk.id=slot.desk_id where slot.id=p_slot_id for update of slot;
  if not found or v_slot.slot_status <> 'Active' or v_slot.desk_status <> 'Active' then raise exception 'This duty slot is no longer active.'; end if;
  if p_scope='NEXT_N' then v_end := p_start_date+730; elsif p_scope='UNTIL_DATE' then v_end := p_until_date; elsif p_scope='ALL_FUTURE' then v_end := greatest(p_start_date, timezone('Pacific/Auckland',now())::date)+365; else v_end := p_start_date; end if;
  select array_agg(duty_date order by duty_date) into v_dates
    from (select duty_date from scheduled_duty_slot_occurrence_dates(p_slot_id,p_start_date,v_end) order by duty_date limit case when p_scope='NEXT_N' then p_count_n else 2147483647 end) occurrences;
  if coalesce(array_length(v_dates,1),0)=0 then raise exception 'No scheduled calendar occurrences were found for this recurring request.'; end if;
  select id into v_old_rule from recurring_rules where profile_id=v_profile_id and slot_id=p_slot_id and action='REGISTER' and lifecycle_status='ACTIVE' for update;
  update recurring_rules set lifecycle_status='SUPERSEDED', superseded_at=now() where id=v_old_rule;
  insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date,until_date,count_n) values(v_profile_id,p_slot_id,'REGISTER',p_scope::rule_type,p_start_date,case when p_scope='UNTIL_DATE' then p_until_date end,case when p_scope='NEXT_N' then p_count_n end) returning id into v_rule_id;
  update recurring_rules set superseded_by=v_rule_id where id=v_old_rule;
  foreach v_date in array v_dates loop
    select id into v_existing from duty_assignments where profile_id=v_profile_id and slot_id=p_slot_id and duty_date=v_date for update;
    if found then
      v_already:=v_already+1;
      insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created) values(v_rule_id,v_profile_id,p_slot_id,v_date,'BOOKED',false) returning id into v_outcome_id;
      v_occurrences:=v_occurrences||jsonb_build_object('duty_date',v_date,'status','BOOKED','booking_created',false,'outcome_id',v_outcome_id); continue;
    end if;
    v_reason:=null;
    if is_duty_slot_holiday(p_slot_id,v_date) then v_reason:='STATUTORY_HOLIDAY'; else select count(*) into v_registered from duty_assignments where slot_id=p_slot_id and duty_date=v_date; if v_registered>=v_slot.max_jps then v_reason:='FULL'; end if; end if;
    if v_reason is null then
      insert into duty_assignments(profile_id,slot_id,duty_date) values(v_profile_id,p_slot_id,v_date) on conflict do nothing returning id into v_existing;
      if v_existing is null then v_reason:='FULL'; else v_new:=v_new+1; end if;
    end if;
    if v_reason is null then
      insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created) values(v_rule_id,v_profile_id,p_slot_id,v_date,'BOOKED',true) returning id into v_outcome_id;
      v_occurrences:=v_occurrences||jsonb_build_object('duty_date',v_date,'status','BOOKED','booking_created',true,'outcome_id',v_outcome_id);
    else
      v_exceptions:=v_exceptions+1;
      insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome) values(v_rule_id,v_profile_id,p_slot_id,v_date,v_reason::recurring_occurrence_outcome) returning id into v_outcome_id;
      v_occurrences:=v_occurrences||jsonb_build_object('duty_date',v_date,'status','EXCEPTION','reason',v_reason,'outcome_id',v_outcome_id);
    end if;
  end loop;
  v_request:=jsonb_build_object('rule_id',v_rule_id,'request_id',p_request_id,'scope',p_scope,'requested_count',jsonb_array_length(v_occurrences),'newly_booked_count',v_new,'already_booked_count',v_already,'exception_count',v_exceptions,'occurrences',v_occurrences);
  insert into recurring_registration_requests(request_id,profile_id,slot_id,recurring_rule_id,result) values(p_request_id,v_profile_id,p_slot_id,v_rule_id,v_request);
  return v_request;
end; $$;
revoke all on function public.apply_recurring_registration(uuid,date,text,integer,date,uuid) from public, anon;
grant execute on function public.apply_recurring_registration(uuid,date,text,integer,date,uuid) to authenticated, service_role;
commit;
