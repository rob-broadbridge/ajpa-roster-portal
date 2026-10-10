-- Stage 3D: durable recurring withdrawal ranges and audit-safe overrides.
begin;

create table if not exists public.recurring_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  recurring_rule_id uuid references public.recurring_rules(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  slot_id uuid not null references public.duty_slots(id) on delete restrict,
  scope text not null check (scope in ('SINGLE','NEXT_N','UNTIL_DATE','ALL_FUTURE')),
  start_date date not null,
  end_date date,
  count_n integer,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  affected_dates date[] not null default '{}'::date[],
  constraint recurring_withdrawal_requests_range_check check (end_date is null or end_date >= start_date)
);

create index if not exists recurring_withdrawal_requests_member_slot_idx
  on public.recurring_withdrawal_requests(profile_id, slot_id, start_date);
alter table public.recurring_withdrawal_requests enable row level security;
revoke all on public.recurring_withdrawal_requests from public, anon, authenticated;
grant select, insert on public.recurring_withdrawal_requests to service_role;

create table if not exists public.recurring_withdrawal_overrides (
  id uuid primary key default gen_random_uuid(),
  recurring_rule_id uuid references public.recurring_rules(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  slot_id uuid not null references public.duty_slots(id) on delete restrict,
  duty_date date not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(profile_id, slot_id, duty_date, recurring_rule_id)
);
alter table public.recurring_withdrawal_overrides enable row level security;
revoke all on public.recurring_withdrawal_overrides from public, anon, authenticated;
grant select, insert on public.recurring_withdrawal_overrides to service_role;

create or replace function public.record_recurring_withdrawal_override()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.outcome='BOOKED' then
    insert into recurring_withdrawal_overrides(recurring_rule_id,profile_id,slot_id,duty_date,actor_profile_id)
      select o.recurring_rule_id,o.profile_id,o.slot_id,o.duty_date,auth.uid()
      from recurring_occurrence_outcomes o
      where o.profile_id=new.profile_id and o.slot_id=new.slot_id and o.duty_date=new.duty_date
        and o.outcome='WITHDRAWN' and o.recurring_rule_id<>new.recurring_rule_id
      on conflict do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists record_recurring_withdrawal_override_after_outcome on public.recurring_occurrence_outcomes;
create trigger record_recurring_withdrawal_override_after_outcome
after insert or update of outcome on public.recurring_occurrence_outcomes
for each row execute function public.record_recurring_withdrawal_override();

create or replace function public.apply_duty_assignment_change(
  p_action text, p_slot_id uuid, p_start_date date, p_scope text default 'SINGLE',
  p_count_n integer default null, p_until_date date default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_profile_id uuid:=auth.uid(); v_member record; v_slot record; v_rule record;
  v_rule_id uuid; v_request_id uuid; v_today date; v_end date; v_date date;
  v_dates date[]; v_affected integer:=0; v_cancelled integer:=0;
begin
  if v_profile_id is null then raise exception 'You must be signed in to change a roster booking.'; end if;
  if not exists(select 1 from profiles where id=v_profile_id and status='Approved') then raise exception 'Your account is not approved for roster bookings.'; end if;
  p_action:=upper(coalesce(p_action,'')); p_scope:=upper(coalesce(p_scope,''));
  if p_action not in ('WITHDRAW','REGISTER') or (p_action='REGISTER' and p_scope<>'SINGLE') then raise exception 'Only SINGLE registration or withdrawal is supported by this RPC.'; end if;
  if p_scope not in ('SINGLE','NEXT_N','UNTIL_DATE','ALL_FUTURE') or p_start_date is null then raise exception 'Withdrawal scope or start date is invalid.'; end if;
  if p_scope='NEXT_N' and (p_count_n is null or p_count_n<1 or p_count_n>52) then raise exception 'NEXT_N must be between 1 and 52.'; end if;
  if p_scope='UNTIL_DATE' and (p_until_date is null or p_until_date<p_start_date) then raise exception 'Choose an end date on or after the first shift.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('ajpa-stage2c-lifecycle',0));
  select * into v_member from profiles where id=v_profile_id for update;
  perform pg_advisory_xact_lock(hashtextextended('ajpa-stage3b-recurring-registration:'||v_profile_id||':'||p_slot_id,0));
  select slot.*, desk.status as desk_status, coalesce(region.timezone,'Pacific/Auckland') as roster_timezone
    into v_slot from duty_slots slot join service_desks desk on desk.id=slot.desk_id
    left join regions region on region.id=desk.region_id where slot.id=p_slot_id for update of slot;
  if not found or v_slot.status<>'Active' or v_slot.desk_status<>'Active' then raise exception 'This duty slot is no longer active.'; end if;
  v_today:=timezone(v_slot.roster_timezone,now())::date;
  if p_scope='SINGLE' then v_end:=p_start_date;
  elsif p_scope='NEXT_N' then v_end:=p_start_date+730;
  elsif p_scope='UNTIL_DATE' then v_end:=p_until_date;
  else v_end:=null;
  end if;

  -- Lock the applicable rule before processing assignments/outcomes.
  select * into v_rule from recurring_rules where profile_id=v_profile_id and slot_id=p_slot_id
    and action='REGISTER' and lifecycle_status='ACTIVE' order by created_at desc limit 1 for update;
  if p_action='REGISTER' then
    if is_duty_slot_holiday(p_slot_id,p_start_date) then raise exception 'This duty slot is unavailable on the selected date.'; end if;
    if exists(select 1 from duty_assignments where profile_id=v_profile_id and slot_id=p_slot_id and duty_date=p_start_date) then raise exception 'You are already registered for this shift.'; end if;
    if (select count(*) from duty_assignments where slot_id=p_slot_id and duty_date=p_start_date)>=v_slot.max_jps then raise exception 'This slot is already full.'; end if;
    if v_rule.id is null or exists(
      select 1 from recurring_occurrence_outcomes o
      where o.profile_id=v_profile_id and o.slot_id=p_slot_id and o.duty_date=p_start_date
        and o.outcome='WITHDRAWN'
        and not exists(select 1 from recurring_withdrawal_overrides x
          where x.profile_id=o.profile_id and x.slot_id=o.slot_id and x.duty_date=o.duty_date and x.recurring_rule_id=o.recurring_rule_id)
    ) then
      if v_rule.id is not null then
        update recurring_rules set lifecycle_status='ENDED',ended_at=coalesce(ended_at,now()) where id=v_rule.id;
      end if;
      insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date,count_n)
        values(v_profile_id,p_slot_id,'REGISTER','NEXT_N',p_start_date,1) returning id into v_rule_id;
    else
      v_rule_id:=v_rule.id;
    end if;
    insert into duty_assignments(profile_id,slot_id,duty_date) values(v_profile_id,p_slot_id,p_start_date);
    insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created,details) values(v_rule_id,v_profile_id,p_slot_id,p_start_date,'BOOKED',true,jsonb_build_object('manual_single_registration',true)) on conflict (recurring_rule_id,duty_date) do update set outcome='BOOKED',booking_created=true,details=excluded.details,updated_at=now();
    return jsonb_build_object('action','REGISTER','scope','SINGLE','affected_count',1,'affected_dates',jsonb_build_array(p_start_date),'rule_id',v_rule_id);
  end if;
  if p_scope='ALL_FUTURE' then
    select coalesce(array_agg(a.duty_date order by a.duty_date),'{}'::date[]) into v_dates
      from duty_assignments a where a.profile_id=v_profile_id and a.slot_id=p_slot_id and a.duty_date>=p_start_date;
    if v_rule.id is null and coalesce(array_length(v_dates,1),0)=0 then raise exception 'No applicable active recurring registration or future booking exists.'; end if;
    update recurring_rules set lifecycle_status='ENDED',ended_at=coalesce(ended_at,now())
      where profile_id=v_profile_id and slot_id=p_slot_id and lifecycle_status='ACTIVE';
    insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date,count_n)
      values(v_profile_id,p_slot_id,'WITHDRAW','ALL_FUTURE'::rule_type,p_start_date,null) returning id into v_rule_id;
  else
    if p_scope='SINGLE' then
      v_dates:=array[p_start_date];
    else
      select array_agg(duty_date order by duty_date) into v_dates from (
      select duty_date from scheduled_duty_slot_occurrence_dates(p_slot_id,p_start_date,v_end)
      order by duty_date limit case when p_scope='NEXT_N' then p_count_n else 2147483647 end
      ) q;
    end if;
    if p_scope='SINGLE' then
      v_rule_id:=v_rule.id;
      if v_rule_id is null and not exists(select 1 from duty_assignments where profile_id=v_profile_id and slot_id=p_slot_id and duty_date=p_start_date) then raise exception 'No matching booking or recurring registration exists.'; end if;
    else
      insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date,until_date,count_n)
        values(v_profile_id,p_slot_id,'WITHDRAW',p_scope::rule_type,p_start_date,
          case when p_scope='UNTIL_DATE' then p_until_date end,
          case when p_scope='NEXT_N' then p_count_n end) returning id into v_rule_id;
    end if;
  end if;
  if p_scope<>'ALL_FUTURE' and (v_dates is null or coalesce(array_length(v_dates,1),0)=0) then raise exception 'No scheduled calendar occurrences were found.'; end if;
  insert into recurring_withdrawal_requests(recurring_rule_id,profile_id,slot_id,scope,start_date,end_date,count_n,requested_by,affected_dates)
    values(v_rule_id,v_profile_id,p_slot_id,p_scope,p_start_date,p_until_date,p_count_n,v_profile_id,v_dates) returning id into v_request_id;
  foreach v_date in array v_dates loop
    delete from duty_assignments where profile_id=v_profile_id and slot_id=p_slot_id and duty_date=v_date;
    get diagnostics v_affected = row_count;
    v_cancelled:=v_cancelled+v_affected;
    if v_rule_id is not null then
      insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,details)
        values(v_rule_id,v_profile_id,p_slot_id,v_date,'WITHDRAWN',jsonb_build_object('request_id',v_request_id,'booking_cancelled',v_affected>0))
        on conflict (recurring_rule_id,duty_date) do update set outcome='WITHDRAWN',details=excluded.details,updated_at=now();
    end if;
  end loop;
  return jsonb_build_object('action','WITHDRAW','scope',p_scope,'request_id',v_request_id,'rule_id',v_rule_id,
    'affected_count',coalesce(array_length(v_dates,1),0),'cancelled_booking_count',v_cancelled,'affected_dates',to_jsonb(v_dates));
end; $$;
revoke all on function public.apply_duty_assignment_change(text,uuid,date,text,integer,date) from public,anon;
grant execute on function public.apply_duty_assignment_change(text,uuid,date,text,integer,date) to authenticated,service_role;

create or replace function public.apply_duty_assignment_change_for_member(p_member_id uuid,p_action text,p_slot_id uuid,p_duty_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_member record; v_slot record; v_cancelled integer:=0; v_rule_id uuid; v_audit uuid;
begin
  if v_actor is null or upper(coalesce(p_action,''))<>'WITHDRAW' then raise exception 'Administrative withdrawal is invalid.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ajpa-stage2c-lifecycle',0));
  if not exists(select 1 from profiles where id=p_member_id and status='Approved') then raise exception 'The selected JP member is not an active approved member.'; end if;
  select * into v_member from profiles where id=p_member_id for update;
  perform pg_advisory_xact_lock(hashtextextended('ajpa-stage3b-recurring-registration:'||p_member_id||':'||p_slot_id,0));
  select slot.*,desk.id as desk_id,desk.status as desk_status into v_slot from duty_slots slot join service_desks desk on desk.id=slot.desk_id where slot.id=p_slot_id for update of slot;
  if not found or v_slot.status<>'Active' or v_slot.desk_status<>'Active' or not public.is_registrar_or_assigned_desk_admin(v_slot.desk_id) then raise exception 'You are not authorised for this Service Desk.'; end if;
  if not exists(select 1 from duty_slot_occurrence_dates(p_slot_id,p_duty_date,p_duty_date,true) where duty_date=p_duty_date) then raise exception 'This date is not a valid scheduled occurrence.'; end if;
  if not exists(select 1 from duty_assignments where profile_id=p_member_id and slot_id=p_slot_id and duty_date=p_duty_date) then
    select id into v_audit from recurring_withdrawal_requests where profile_id=p_member_id and slot_id=p_slot_id and scope='SINGLE' and start_date=p_duty_date and requested_by=v_actor order by requested_at desc limit 1;
    if v_audit is not null then return jsonb_build_object('action','WITHDRAW','member_id',p_member_id,'duty_date',p_duty_date,'request_id',v_audit); end if;
    raise exception 'This JP member is not registered for this shift.';
  end if;
  insert into recurring_rules(profile_id,slot_id,action,rule_type,start_date,count_n) values(p_member_id,p_slot_id,'WITHDRAW','NEXT_N',p_duty_date,1) returning id into v_rule_id;
  delete from duty_assignments where profile_id=p_member_id and slot_id=p_slot_id and duty_date=p_duty_date;
  get diagnostics v_cancelled=row_count;
  insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,details)
    values(v_rule_id,p_member_id,p_slot_id,p_duty_date,'WITHDRAWN',jsonb_build_object('administrative_actor',v_actor,'booking_cancelled',v_cancelled>0));
  insert into recurring_withdrawal_requests(recurring_rule_id,profile_id,slot_id,scope,start_date,count_n,requested_by,affected_dates)
    values(v_rule_id,p_member_id,p_slot_id,'SINGLE',p_duty_date,1,v_actor,array[p_duty_date]) returning id into v_audit;
  return jsonb_build_object('action','WITHDRAW','member_id',p_member_id,'duty_date',p_duty_date,'request_id',v_audit);
end; $$;
revoke all on function public.apply_duty_assignment_change_for_member(uuid,text,uuid,date) from public,anon;
grant execute on function public.apply_duty_assignment_change_for_member(uuid,text,uuid,date) to authenticated;

-- Stage 2C archive compatibility. This is the exact deployed lifecycle
-- signature and behavior, with the retained-rule update kept explicit so
-- outcome foreign keys remain valid. No global DELETE trigger is used.
create or replace function public.apply_member_lifecycle_transition(
  p_member_id uuid, p_action text, p_new_role app_role default null,
  p_expected_status account_status default null, p_expected_role app_role default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor record; v_member record; v_assignment record;
  v_future integer := 0; v_rules integer := 0; v_desks integer := 0;
  v_action text := upper(trim(coalesce(p_action,'')));
begin
  perform pg_advisory_xact_lock(hashtextextended('ajpa-stage2c-lifecycle',0));
  select id,status,role into v_actor from profiles where id=auth.uid() for update;
  if v_actor.id is null or v_actor.status <> 'Approved' or v_actor.role <> 'Registrar' then raise exception 'Only an approved Registrar can change account lifecycle.'; end if;
  select * into v_member from profiles where id=p_member_id for update;
  if not found then raise exception 'Member not found.'; end if;
  if p_expected_status is not null and v_member.status <> p_expected_status then raise exception 'Member changed since it was loaded; refresh and try again.' using errcode='40001'; end if;
  if p_expected_role is not null and v_member.role <> p_expected_role then raise exception 'Member role changed since it was loaded; refresh and try again.' using errcode='40001'; end if;
  if v_action in ('APPROVE','REJECT','RECONSIDER') then
    if v_action='APPROVE' and v_member.status='Pending' then update profiles set status='Approved' where id=p_member_id;
    elsif v_action='REJECT' and v_member.status='Pending' then update profiles set status='Rejected' where id=p_member_id;
    elsif v_action='RECONSIDER' and v_member.status='Rejected' then update profiles set status='Pending' where id=p_member_id;
    else raise exception 'Invalid account status transition.'; end if;
  elsif v_action='REINSTATE' then
    if v_member.status <> 'Archived' or p_new_role is null then raise exception 'Reinstatement requires an Archived member and an explicit role.'; end if;
    if p_new_role not in ('Member','Admin','Registrar') then raise exception 'Select Member, Admin or Registrar.'; end if;
    update profiles set status='Approved', role=p_new_role where id=p_member_id;
  elsif v_action='CHANGE_ROLE' then
    if v_member.status <> 'Approved' or p_new_role is null or p_new_role not in ('Member','Admin','Registrar') then raise exception 'Only approved members can change to a valid role.'; end if;
    if v_member.role='Registrar' and p_new_role <> 'Registrar' and (select count(*) from profiles where status='Approved' and role='Registrar') <= 1 then raise exception 'The last approved Registrar cannot be demoted.'; end if;
    if p_new_role <> 'Admin' then update service_desks set primary_admin_id=null where primary_admin_id=p_member_id; update service_desks set secondary_admin_id=null where secondary_admin_id=p_member_id; end if;
    update profiles set role=p_new_role where id=p_member_id;
  elsif v_action='ARCHIVE' then
    if v_member.status <> 'Approved' then raise exception 'Only an approved member can be archived.'; end if;
    if v_member.role='Registrar' and (select count(*) from profiles where status='Approved' and role='Registrar') <= 1 then raise exception 'The last approved Registrar cannot be archived.'; end if;
    select count(*) into v_desks from service_desks where primary_admin_id=p_member_id or secondary_admin_id=p_member_id;
    for v_assignment in select a.slot_id,a.duty_date,d.name as desk_name from duty_assignments a join duty_slots s on s.id=a.slot_id join service_desks d on d.id=s.desk_id left join regions r on r.id=d.region_id where a.profile_id=p_member_id and a.duty_date+s.start_time > timezone(coalesce(r.timezone,'Pacific/Auckland'),now()) for update of a loop
      insert into duty_assignment_cancellations(profile_id,slot_id,duty_date,desk_name_snapshot,cancelled_by,reason)
        values(p_member_id,v_assignment.slot_id,v_assignment.duty_date,v_assignment.desk_name,auth.uid(),'MEMBER_ARCHIVED')
        on conflict (profile_id,slot_id,duty_date) do update set cancelled_at=now(), cancelled_by=auth.uid(), reason='MEMBER_ARCHIVED';
      delete from duty_assignments where profile_id=p_member_id and slot_id=v_assignment.slot_id and duty_date=v_assignment.duty_date; v_future := v_future + 1;
    end loop;
    select count(*) into v_rules from recurring_rules where profile_id=p_member_id and lifecycle_status='ACTIVE';
    update recurring_rules set lifecycle_status='ENDED', ended_at=coalesce(ended_at,now()) where profile_id=p_member_id and lifecycle_status='ACTIVE';
    update service_desks set primary_admin_id=null where primary_admin_id=p_member_id;
    update service_desks set secondary_admin_id=null where secondary_admin_id=p_member_id;
    update profiles set status='Archived' where id=p_member_id;
  else raise exception 'Unsupported lifecycle action.'; end if;
  insert into roster_activity_audit(actor_profile_id,subject_profile_id,event_type,previous_status,new_status,previous_role,new_role)
    values(auth.uid(),p_member_id,'MEMBER_'||v_action,v_member.status,(select status::text from profiles where id=p_member_id),v_member.role::text,(select role::text from profiles where id=p_member_id));
  return jsonb_build_object('member_id',p_member_id,'action',v_action,'status',(select status from profiles where id=p_member_id),'role',(select role from profiles where id=p_member_id),'future_booking_count',v_future,'recurring_rule_count',v_rules,'desk_admin_assignment_count',v_desks);
end; $$;
revoke all on function public.apply_member_lifecycle_transition(uuid,text,app_role,account_status,app_role) from public,anon,authenticated;
grant execute on function public.apply_member_lifecycle_transition(uuid,text,app_role,account_status,app_role) to authenticated;

comment on table public.recurring_withdrawal_requests is 'Durable Stage 3D withdrawal range requests; no infinite outcome expansion for ALL_FUTURE.';

-- A finite withdrawal remains effective while its prior REGISTER rule is
-- active. A deliberate new registration creates a new rule/outcome identity.
create or replace function public.materialize_recurring_duty_assignments(p_horizon_days integer default 142)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rule record; v_slot record; v_member record; v_date date; v_today date; v_end date; v_registered integer;
  v_outcome record; v_outcome_id uuid; v_inserted integer:=0; v_withdrawn integer:=0; v_processed integer:=0;
  v_reason public.recurring_occurrence_outcome; v_booking boolean;
begin
  for v_rule in select * from recurring_rules where lifecycle_status='ACTIVE' order by case when action='REGISTER' then 0 else 1 end,created_at,id loop
    perform pg_advisory_xact_lock(hashtextextended('ajpa-stage2c-lifecycle',0));
    select * into v_member from profiles where id=v_rule.profile_id for update;
    if not found then continue; end if;
    select slot.*,desk.status as desk_status,coalesce(region.timezone,'Pacific/Auckland') as roster_timezone into v_slot from duty_slots slot join service_desks desk on desk.id=slot.desk_id left join regions region on region.id=desk.region_id where slot.id=v_rule.slot_id for update of slot;
    if not found then continue; end if;
    select * into v_rule from recurring_rules where id=v_rule.id for update;
    if not found or v_rule.lifecycle_status<>'ACTIVE' then continue; end if;
    v_today:=timezone(v_slot.roster_timezone,now())::date;
    if v_rule.rule_type='NEXT_N' then v_end:=v_rule.start_date+730; elsif v_rule.rule_type='UNTIL_DATE' then v_end:=v_rule.until_date; else v_end:=v_today+141; end if;
    if v_end is null then continue; end if;
    for v_date in select generated_day::date from generate_series(greatest(v_rule.start_date,v_today),v_end,interval '1 day') generated_day where extract(dow from generated_day)::integer=v_slot.day_of_week order by generated_day limit case when v_rule.rule_type='NEXT_N' then least(greatest(coalesce(v_rule.count_n,1),1),52) else 2147483647 end loop
      select * into v_outcome from recurring_occurrence_outcomes where recurring_rule_id=v_rule.id and duty_date=v_date;
      if found then continue; end if;
      if v_rule.action='REGISTER' and exists(select 1 from recurring_occurrence_outcomes o where o.profile_id=v_rule.profile_id and o.slot_id=v_rule.slot_id and o.duty_date=v_date and o.outcome='WITHDRAWN' and not exists(select 1 from recurring_withdrawal_overrides x where x.profile_id=o.profile_id and x.slot_id=o.slot_id and x.duty_date=o.duty_date and x.recurring_rule_id=o.recurring_rule_id)) then continue; end if;
      v_processed:=v_processed+1; v_reason:=null; v_booking:=null;
      if v_rule.action='WITHDRAW' then delete from duty_assignments where profile_id=v_rule.profile_id and slot_id=v_rule.slot_id and duty_date=v_date; if found then v_withdrawn:=v_withdrawn+1; end if; insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome) values(v_rule.id,v_rule.profile_id,v_rule.slot_id,v_date,'WITHDRAWN'); continue; end if;
      if v_member.status<>'Approved' then v_reason:='MEMBER_INELIGIBLE'; elsif v_slot.status<>'Active' or v_slot.desk_status<>'Active' then v_reason:='DESK_CLOSED'; elsif exists(select 1 from duty_assignments a where a.profile_id=v_rule.profile_id and a.slot_id=v_rule.slot_id and a.duty_date=v_date) then v_booking:=false; elsif is_duty_slot_holiday(v_rule.slot_id,v_date) then v_reason:='STATUTORY_HOLIDAY'; else select count(*) into v_registered from duty_assignments where slot_id=v_rule.slot_id and duty_date=v_date; if v_registered>=v_slot.max_jps then v_reason:='FULL'; end if; end if;
      if v_reason is null and v_booking is null then insert into duty_assignments(profile_id,slot_id,duty_date) values(v_rule.profile_id,v_rule.slot_id,v_date) on conflict do nothing returning id into v_outcome_id; if v_outcome_id is null then v_reason:='FULL'; else v_inserted:=v_inserted+1; v_booking:=true; end if; end if;
      if v_booking is not null then insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created) values(v_rule.id,v_rule.profile_id,v_rule.slot_id,v_date,'BOOKED',v_booking); else insert into recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome) values(v_rule.id,v_rule.profile_id,v_rule.slot_id,v_date,v_reason); end if;
    end loop;
  end loop;
  return jsonb_build_object('processed_occurrences',v_processed,'inserted_assignments',v_inserted,'withdrawn_assignments',v_withdrawn);
end; $$;
revoke all on function public.materialize_recurring_duty_assignments(integer) from public,anon,authenticated;
grant execute on function public.materialize_recurring_duty_assignments(integer) to service_role;
commit;
