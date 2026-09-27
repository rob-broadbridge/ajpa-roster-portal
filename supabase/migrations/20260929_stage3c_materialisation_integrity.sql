-- Stage 3C: lifecycle-safe recurring materialisation and durable outcomes.
begin;

create or replace function public.materialize_recurring_duty_assignments(p_horizon_days integer default 142)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_rule record; v_slot record; v_member record; v_date date; v_today date;
  v_end date; v_registered integer; v_outcome record; v_outcome_id uuid;
  v_inserted integer:=0; v_withdrawn integer:=0; v_processed integer:=0;
  v_reason public.recurring_occurrence_outcome; v_booking boolean;
begin
  for v_rule in select * from public.recurring_rules where lifecycle_status='ACTIVE' order by case when action='REGISTER' then 0 else 1 end,created_at,id loop
    perform pg_advisory_xact_lock(hashtextextended('ajpa-stage2c-lifecycle',0));
    select * into v_member from public.profiles where id=v_rule.profile_id for update;
    if not found then continue; end if;
    select slot.*,desk.status as desk_status,coalesce(region.timezone,'Pacific/Auckland') as roster_timezone into v_slot from public.duty_slots slot join public.service_desks desk on desk.id=slot.desk_id left join public.regions region on region.id=desk.region_id where slot.id=v_rule.slot_id for update of slot;
    if not found then continue; end if;
    select * into v_rule from public.recurring_rules where id=v_rule.id for update;
    if not found or v_rule.lifecycle_status <> 'ACTIVE' then continue; end if;
    if not found then continue; end if;
    v_today:=timezone(v_slot.roster_timezone,now())::date;
    if v_rule.rule_type='NEXT_N' then v_end:=v_rule.start_date+730; elsif v_rule.rule_type='UNTIL_DATE' then v_end:=v_rule.until_date; else v_end:=v_today+141; end if;
    if v_end is null then continue; end if;
    for v_date in select generated_day::date from generate_series(greatest(v_rule.start_date,v_today),v_end,interval '1 day') generated_day where extract(dow from generated_day)::integer=v_slot.day_of_week order by generated_day limit case when v_rule.rule_type='NEXT_N' then least(greatest(coalesce(v_rule.count_n,1),1),52) else 2147483647 end loop
      select * into v_outcome from public.recurring_occurrence_outcomes where recurring_rule_id=v_rule.id and duty_date=v_date;
      if found then continue; end if;
      v_processed:=v_processed+1; v_reason:=null; v_booking:=null;
      if v_rule.action='WITHDRAW' then
        delete from public.duty_assignments where profile_id=v_rule.profile_id and slot_id=v_rule.slot_id and duty_date=v_date;
        if found then v_withdrawn:=v_withdrawn+1; end if;
        insert into public.recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome) values(v_rule.id,v_rule.profile_id,v_rule.slot_id,v_date,'WITHDRAWN'); continue;
      end if;
      if v_member.status <> 'Approved' then v_reason:='MEMBER_INELIGIBLE';
      elsif v_slot.status <> 'Active' or v_slot.desk_status <> 'Active' then v_reason:='DESK_CLOSED';
      elsif exists(select 1 from public.duty_assignments a where a.profile_id=v_rule.profile_id and a.slot_id=v_rule.slot_id and a.duty_date=v_date) then v_booking:=false;
      elsif public.is_duty_slot_holiday(v_rule.slot_id,v_date) then v_reason:='STATUTORY_HOLIDAY';
      else select count(*) into v_registered from public.duty_assignments where slot_id=v_rule.slot_id and duty_date=v_date; if v_registered >= v_slot.max_jps then v_reason:='FULL'; end if; end if;
      if v_reason is null and v_booking is null then
        insert into public.duty_assignments(profile_id,slot_id,duty_date) values(v_rule.profile_id,v_rule.slot_id,v_date) on conflict do nothing returning id into v_outcome_id;
        if v_outcome_id is null then v_reason:='FULL'; else v_inserted:=v_inserted+1; v_booking:=true; end if;
      end if;
      if v_booking is not null then insert into public.recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome,booking_created) values(v_rule.id,v_rule.profile_id,v_rule.slot_id,v_date,'BOOKED',v_booking); else insert into public.recurring_occurrence_outcomes(recurring_rule_id,profile_id,slot_id,duty_date,outcome) values(v_rule.id,v_rule.profile_id,v_rule.slot_id,v_date,v_reason); end if;
    end loop;
  end loop;
  return jsonb_build_object('processed_occurrences',v_processed,'inserted_assignments',v_inserted,'withdrawn_assignments',v_withdrawn);
end; $$;
revoke all on function public.materialize_recurring_duty_assignments(integer) from public,anon,authenticated;
grant execute on function public.materialize_recurring_duty_assignments(integer) to service_role;
do $$ declare v_job record; begin if to_regclass('cron.job') is not null then for v_job in select jobid from cron.job where jobname='ajpa-recurring-assignment-materialiser-daily' loop perform cron.unschedule(v_job.jobid); end loop; perform cron.schedule('ajpa-recurring-assignment-materialiser-daily','17 14 * * *','select public.materialize_recurring_duty_assignments(142);'); end if; exception when undefined_function then null; end $$;
commit;
