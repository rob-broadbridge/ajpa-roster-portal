-- Stage 3A compatibility correction.
-- End recurring instructions instead of deleting rows whose occurrence history
-- may now reference them.  This is not the Stage 3B supersession workflow.

begin;

create or replace function public.get_member_lifecycle_preview(p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor record; v_member record; v_now timestamptz:=now(); v_future integer; v_rules integer; v_desks integer;
begin
  select id,status,role into v_actor from profiles where id=auth.uid();
  if v_actor.status <> 'Approved' or v_actor.role <> 'Registrar' then raise exception 'Only an approved Registrar can preview lifecycle actions.'; end if;
  select id,full_name,status,role into v_member from profiles where id=p_member_id;
  if not found then raise exception 'Member not found.'; end if;
  select count(*) into v_future from duty_assignments a join duty_slots s on s.id=a.slot_id join service_desks d on d.id=s.desk_id left join regions r on r.id=d.region_id where a.profile_id=p_member_id and a.duty_date+s.start_time > timezone(coalesce(r.timezone,'Pacific/Auckland'),v_now);
  select count(*) into v_rules from recurring_rules where profile_id=p_member_id and lifecycle_status='ACTIVE';
  select count(*) into v_desks from service_desks where primary_admin_id=p_member_id or secondary_admin_id=p_member_id;
  return jsonb_build_object('member_id',v_member.id,'full_name',v_member.full_name,'status',v_member.status,'role',v_member.role,'future_booking_count',v_future,'recurring_rule_count',v_rules,'desk_admin_assignment_count',v_desks);
end; $$;

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
  if v_actor.status <> 'Approved' or v_actor.role <> 'Registrar' then raise exception 'Only an approved Registrar can change account lifecycle.'; end if;
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

create or replace function public.apply_duty_assignment_change(
  p_action text, p_slot_id uuid, p_start_date date, p_scope text default 'SINGLE',
  p_count_n integer default null, p_until_date date default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid := auth.uid(); v_slot record; v_today date; v_now_time time;
  v_end_date date; v_count_n integer; v_dates date[]; v_date date;
  v_registered_count integer; v_shift_finished boolean;
begin
  if v_profile_id is null then raise exception 'You must be signed in to change a roster booking.'; end if;
  if not exists (select 1 from public.profiles where id=v_profile_id and status='Approved') then raise exception 'Your account is not approved for roster bookings.'; end if;
  p_action := upper(coalesce(p_action, '')); p_scope := upper(coalesce(p_scope, ''));
  if p_action not in ('REGISTER', 'WITHDRAW') then raise exception 'Booking action must be REGISTER or WITHDRAW.'; end if;
  if p_scope not in ('SINGLE', 'NEXT_N', 'UNTIL_DATE', 'ALL_FUTURE') then raise exception 'Booking scope is not valid.'; end if;
  if p_start_date is null then raise exception 'A booking start date is required.'; end if;
  select slot.*, coalesce(region.timezone, 'Pacific/Auckland') as roster_timezone into v_slot
  from public.duty_slots as slot join public.service_desks as desk on desk.id=slot.desk_id left join public.regions as region on region.id=desk.region_id
  where slot.id=p_slot_id and slot.status='Active' and desk.status='Active' for update of slot;
  if not found then raise exception 'This duty slot is no longer active.'; end if;
  v_today := timezone(v_slot.roster_timezone, now())::date; v_now_time := timezone(v_slot.roster_timezone, now())::time;
  v_shift_finished := p_start_date < v_today or (p_start_date=v_today and coalesce(v_slot.end_time,time '00:00') <= v_now_time);
  if v_shift_finished and p_scope <> 'SINGLE' then raise exception 'Only a single past shift can be changed.'; end if;
  v_count_n := least(greatest(coalesce(p_count_n,1),1),52);
  if p_scope='UNTIL_DATE' then
    if p_until_date is null or p_until_date < p_start_date then raise exception 'Choose an end date on or after the first shift.'; end if;
    if p_until_date > p_start_date+730 then raise exception 'The selected end date is more than two years away.'; end if;
    v_end_date:=p_until_date;
  elsif p_scope='NEXT_N' then v_end_date:=p_start_date+730;
  elsif p_scope='ALL_FUTURE' then v_end_date:=greatest(p_start_date,v_today)+365;
  else v_end_date:=p_start_date; end if;
  with candidate_dates as (
    select occurrence.duty_date from public.duty_slot_occurrence_dates(p_slot_id,p_start_date,v_end_date,p_action='WITHDRAW') occurrence
    where (p_scope<>'SINGLE' or occurrence.duty_date=p_start_date)
      and ((p_action='REGISTER' and not exists (select 1 from public.duty_assignments a where a.profile_id=v_profile_id and a.slot_id=p_slot_id and a.duty_date=occurrence.duty_date))
        or (p_action='WITHDRAW' and exists (select 1 from public.duty_assignments a where a.profile_id=v_profile_id and a.slot_id=p_slot_id and a.duty_date=occurrence.duty_date)))
      and (p_scope<>'UNTIL_DATE' or occurrence.duty_date<=p_until_date) order by occurrence.duty_date
  ), selected_dates as (select duty_date from candidate_dates limit case when p_scope='NEXT_N' then v_count_n else 2147483647 end)
  select array_agg(duty_date order by duty_date) into v_dates from selected_dates;
  if coalesce(array_length(v_dates,1),0)=0 then raise exception 'No matching bookings were found.'; end if;
  if p_action='REGISTER' then
    foreach v_date in array v_dates loop
      select count(*) into v_registered_count from public.duty_assignments where slot_id=p_slot_id and duty_date=v_date;
      if v_registered_count >= v_slot.max_jps then raise exception 'The slot on % is already full. No bookings were changed.',v_date; end if;
    end loop;
    if p_scope='SINGLE' then
      update public.recurring_rules set lifecycle_status='ENDED',ended_at=coalesce(ended_at,now()) where profile_id=v_profile_id and slot_id=p_slot_id and action='WITHDRAW' and rule_type='NEXT_N' and start_date=p_start_date and count_n=1 and lifecycle_status='ACTIVE';
    else
      update public.recurring_rules set lifecycle_status='ENDED',ended_at=coalesce(ended_at,now()) where profile_id=v_profile_id and slot_id=p_slot_id and action in ('REGISTER','WITHDRAW') and lifecycle_status='ACTIVE';
      insert into public.recurring_rules(profile_id,slot_id,action,rule_type,start_date,until_date,count_n) values(v_profile_id,p_slot_id,'REGISTER',p_scope::public.rule_type,p_start_date,case when p_scope='UNTIL_DATE' then p_until_date else null end,case when p_scope='NEXT_N' then v_count_n else null end);
    end if;
    foreach v_date in array v_dates loop insert into public.duty_assignments(profile_id,slot_id,duty_date) values(v_profile_id,p_slot_id,v_date) on conflict do nothing; end loop;
  else
    foreach v_date in array v_dates loop delete from public.duty_assignments where profile_id=v_profile_id and slot_id=p_slot_id and duty_date=v_date; end loop;
    if p_scope='ALL_FUTURE' then
      update public.recurring_rules set lifecycle_status='ENDED',ended_at=coalesce(ended_at,now()) where profile_id=v_profile_id and slot_id=p_slot_id and lifecycle_status='ACTIVE';
    else
      foreach v_date in array v_dates loop
        if not v_shift_finished then
          update public.recurring_rules set lifecycle_status='ENDED',ended_at=coalesce(ended_at,now()) where profile_id=v_profile_id and slot_id=p_slot_id and action='WITHDRAW' and rule_type='NEXT_N' and start_date=v_date and count_n=1 and lifecycle_status='ACTIVE';
          insert into public.recurring_rules(profile_id,slot_id,action,rule_type,start_date,until_date,count_n) values(v_profile_id,p_slot_id,'WITHDRAW','NEXT_N'::public.rule_type,v_date,null,1);
        end if;
      end loop;
    end if;
  end if;
  return jsonb_build_object('action',p_action,'scope',p_scope,'affected_count',array_length(v_dates,1),'affected_dates',to_jsonb(v_dates));
end; $$;

create or replace function public.apply_duty_assignment_change_for_member(p_member_id uuid,p_action text,p_slot_id uuid,p_duty_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor_id uuid:=auth.uid(); v_slot record; v_registered_count integer; v_finished boolean;
begin
  if v_actor_id is null then raise exception 'You must be signed in to change a roster booking.'; end if;
  p_action:=upper(coalesce(p_action,'')); if p_action not in ('REGISTER','WITHDRAW') then raise exception 'Booking action must be REGISTER or WITHDRAW.'; end if;
  if p_duty_date is null then raise exception 'A duty date is required.'; end if;
  if not exists(select 1 from public.profiles where id=p_member_id and status='Approved') then raise exception 'The selected JP member is not an active approved member.'; end if;
  select slot.*,desk.id as desk_id,coalesce(region.timezone,'Pacific/Auckland') as roster_timezone into v_slot from public.duty_slots slot join public.service_desks desk on desk.id=slot.desk_id left join public.regions region on region.id=desk.region_id where slot.id=p_slot_id and slot.status='Active' and desk.status='Active' for update of slot;
  if not found then raise exception 'This duty slot is no longer active.'; end if;
  if not public.is_registrar_or_assigned_desk_admin(v_slot.desk_id) then raise exception 'You are not an assigned Desk Admin for this Service Desk.'; end if;
  if not exists(select 1 from public.duty_slot_occurrence_dates(p_slot_id,p_duty_date,p_duty_date,p_action='WITHDRAW') occurrence where occurrence.duty_date=p_duty_date) then raise exception 'This slot does not occur on the selected date or is closed for a holiday.'; end if;
  v_finished:=p_duty_date+v_slot.end_time <= timezone(v_slot.roster_timezone,now());
  if p_action='REGISTER' then
    if exists(select 1 from public.duty_assignments where profile_id=p_member_id and slot_id=p_slot_id and duty_date=p_duty_date) then raise exception 'This JP member is already registered for this shift.'; end if;
    select count(*) into v_registered_count from public.duty_assignments where slot_id=p_slot_id and duty_date=p_duty_date;
    if v_registered_count>=v_slot.max_jps then raise exception 'This slot is already full.'; end if;
    update public.recurring_rules set lifecycle_status='ENDED',ended_at=coalesce(ended_at,now()) where profile_id=p_member_id and slot_id=p_slot_id and action='WITHDRAW' and rule_type='NEXT_N' and start_date=p_duty_date and count_n=1 and lifecycle_status='ACTIVE';
    insert into public.duty_assignments(profile_id,slot_id,duty_date) values(p_member_id,p_slot_id,p_duty_date);
  else
    if not exists(select 1 from public.duty_assignments where profile_id=p_member_id and slot_id=p_slot_id and duty_date=p_duty_date) then raise exception 'This JP member is not registered for this shift.'; end if;
    delete from public.duty_assignments where profile_id=p_member_id and slot_id=p_slot_id and duty_date=p_duty_date;
    if not v_finished then
      update public.recurring_rules set lifecycle_status='ENDED',ended_at=coalesce(ended_at,now()) where profile_id=p_member_id and slot_id=p_slot_id and action='WITHDRAW' and rule_type='NEXT_N' and start_date=p_duty_date and count_n=1 and lifecycle_status='ACTIVE';
      insert into public.recurring_rules(profile_id,slot_id,action,rule_type,start_date,count_n) values(p_member_id,p_slot_id,'WITHDRAW','NEXT_N'::public.rule_type,p_duty_date,1);
    end if;
  end if;
  return jsonb_build_object('action',p_action,'member_id',p_member_id,'duty_date',p_duty_date);
end; $$;

-- The only materialiser change is lifecycle filtering; horizon and all other
-- Stage 2 behaviour remain unchanged until Stage 3C.
create or replace function public.materialize_recurring_duty_assignments(p_horizon_days integer default 365)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rule record; v_slot record; v_date date; v_today date; v_now_time time; v_horizon_date date; v_series_start_date date; v_series_end_date date; v_registered_count integer; v_inserted_count integer:=0; v_withdrawn_count integer:=0;
begin
  for v_rule in select * from public.recurring_rules where lifecycle_status='ACTIVE' order by case when action='REGISTER' then 0 else 1 end,created_at,id loop
    select slot.*,coalesce(region.timezone,'Pacific/Auckland') as roster_timezone into v_slot from public.duty_slots slot join public.service_desks desk on desk.id=slot.desk_id left join public.regions region on region.id=desk.region_id where slot.id=v_rule.slot_id and slot.status='Active' and desk.status='Active' for update of slot;
    if not found then continue; end if;
    v_today:=timezone(v_slot.roster_timezone,now())::date; v_now_time:=timezone(v_slot.roster_timezone,now())::time; v_horizon_date:=v_today+least(greatest(coalesce(p_horizon_days,365),30),730);
    if v_rule.rule_type='NEXT_N' then v_series_start_date:=v_rule.start_date; v_series_end_date:=v_rule.start_date+730; else v_series_start_date:=greatest(v_rule.start_date,v_today); v_series_end_date:=case when v_rule.rule_type='UNTIL_DATE' then least(v_rule.until_date,v_horizon_date) else v_horizon_date end; end if;
    if v_series_end_date is null or v_series_end_date<v_series_start_date then continue; end if;
    for v_date in with fixed_rule_occurrences as (select occurrence.duty_date from public.duty_slot_occurrence_dates(v_rule.slot_id,v_series_start_date,v_series_end_date,v_rule.action='WITHDRAW') occurrence order by occurrence.duty_date limit case when v_rule.rule_type='NEXT_N' then least(greatest(coalesce(v_rule.count_n,1),1),52) else 2147483647 end) select occurrence.duty_date from fixed_rule_occurrences occurrence where occurrence.duty_date>v_today or (occurrence.duty_date=v_today and coalesce(v_slot.end_time,time '00:00')>v_now_time) order by occurrence.duty_date loop
      if v_rule.action='REGISTER' then select count(*) into v_registered_count from public.duty_assignments where slot_id=v_rule.slot_id and duty_date=v_date; if v_registered_count<v_slot.max_jps then insert into public.duty_assignments(profile_id,slot_id,duty_date) values(v_rule.profile_id,v_rule.slot_id,v_date) on conflict do nothing; if found then v_inserted_count:=v_inserted_count+1; end if; end if;
      else delete from public.duty_assignments where profile_id=v_rule.profile_id and slot_id=v_rule.slot_id and duty_date=v_date; if found then v_withdrawn_count:=v_withdrawn_count+1; end if; end if;
    end loop;
  end loop;
  return jsonb_build_object('inserted_assignments',v_inserted_count,'withdrawn_assignments',v_withdrawn_count);
end; $$;

commit;
