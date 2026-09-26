-- Stage 2C: explicit, atomic account lifecycle transitions.
-- Auth identities are intentionally retained; Archived is an operational status.

begin;

create table if not exists public.duty_assignment_cancellations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  slot_id uuid,
  duty_date date not null,
  desk_name_snapshot text,
  cancelled_at timestamptz not null default now(),
  cancelled_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  unique(profile_id, slot_id, duty_date)
);
alter table public.duty_assignment_cancellations enable row level security;
revoke all on public.duty_assignment_cancellations from public, anon, authenticated;
-- Stage 2B allowed vacant desks in the business rules; remove its interim
-- NOT NULL constraint so archive and demotion can clear assignments atomically.
alter table public.service_desks alter column primary_admin_id drop not null;
alter table public.roster_activity_audit add column if not exists previous_status text;
alter table public.roster_activity_audit add column if not exists new_status text;
alter table public.roster_activity_audit add column if not exists previous_role text;
alter table public.roster_activity_audit add column if not exists new_role text;

create or replace function public.validate_service_desk_administrators()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.primary_admin_id is not null and not exists (select 1 from profiles where id=new.primary_admin_id and status='Approved' and role='Admin') then
    raise exception 'The selected Primary Desk Admin must be an approved Desk Admin.';
  end if;
  if new.secondary_admin_id is not null and not exists (select 1 from profiles where id=new.secondary_admin_id and status='Approved' and role='Admin') then
    raise exception 'The selected Secondary Desk Admin must be an approved Desk Admin.';
  end if;
  if new.secondary_admin_id is not null and new.secondary_admin_id = new.primary_admin_id then raise exception 'Primary and Secondary Desk Admins must be different people.'; end if;
  return new;
end; $$;

create or replace function public.update_member_profile_and_role(
  p_member_id uuid, p_full_name text, p_phone text, p_warrant_number text,
  p_is_provisional boolean, p_new_role app_role, p_expected_status account_status,
  p_expected_role app_role
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_member record; v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('ajpa-stage2c-lifecycle',0));
  if not exists (select 1 from profiles where id=auth.uid() and status='Approved' and role='Registrar') then raise exception 'Only an approved Registrar can update member lifecycle.'; end if;
  select * into v_member from profiles where id=p_member_id for update;
  if not found or v_member.status <> p_expected_status or v_member.role <> p_expected_role then raise exception 'Member changed since it was loaded; refresh and try again.' using errcode='40001'; end if;
  if v_member.status <> 'Approved' or p_new_role not in ('Member','Admin','Registrar') then raise exception 'Only approved members can be saved with a valid role.'; end if;
  if v_member.role='Registrar' and p_new_role <> 'Registrar' and (select count(*) from profiles where status='Approved' and role='Registrar') <= 1 then raise exception 'The last approved Registrar cannot be demoted.'; end if;
  if p_new_role <> 'Admin' then update service_desks set primary_admin_id=null where primary_admin_id=p_member_id; update service_desks set secondary_admin_id=null where secondary_admin_id=p_member_id; end if;
  update profiles set full_name=trim(p_full_name), phone=trim(p_phone), warrant_number=p_warrant_number, is_provisional=p_is_provisional, role=p_new_role where id=p_member_id;
  insert into roster_activity_audit(actor_profile_id,subject_profile_id,event_type,previous_status,new_status,previous_role,new_role) values(auth.uid(),p_member_id,'MEMBER_ROLE_CHANGED',v_member.status,v_member.status,v_member.role::text,p_new_role::text);
  select jsonb_build_object('id',id,'status',status,'role',role,'full_name',full_name,'phone',phone,'warrant_number',warrant_number,'is_provisional',is_provisional) into v_result from profiles where id=p_member_id;
  return v_result;
end; $$;

create or replace function public.get_member_lifecycle_preview(p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor record; v_member record; v_now timestamptz := now(); v_future integer; v_rules integer; v_desks integer;
begin
  select id,status,role into v_actor from profiles where id=auth.uid();
  if v_actor.status <> 'Approved' or v_actor.role <> 'Registrar' then raise exception 'Only an approved Registrar can preview lifecycle actions.'; end if;
  select id,full_name,status,role into v_member from profiles where id=p_member_id;
  if not found then raise exception 'Member not found.'; end if;
  select count(*) into v_future from duty_assignments a join duty_slots s on s.id=a.slot_id join service_desks d on d.id=s.desk_id left join regions r on r.id=d.region_id
    where a.profile_id=p_member_id and a.duty_date + s.start_time > timezone(coalesce(r.timezone,'Pacific/Auckland'),v_now);
  select count(*) into v_rules from recurring_rules where profile_id=p_member_id;
  select count(*) into v_desks from service_desks where primary_admin_id=p_member_id or secondary_admin_id=p_member_id;
  return jsonb_build_object('member_id',v_member.id,'full_name',v_member.full_name,'status',v_member.status,'role',v_member.role,'future_booking_count',v_future,'recurring_rule_count',v_rules,'desk_admin_assignment_count',v_desks);
end; $$;

create or replace function public.apply_member_lifecycle_transition(
  p_member_id uuid, p_action text, p_new_role app_role default null,
  p_expected_status account_status default null, p_expected_role app_role default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor record; v_member record; v_assignment record; v_future integer := 0; v_rules integer := 0; v_desks integer := 0; v_action text := upper(trim(coalesce(p_action,'')));
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
    select count(*) into v_rules from recurring_rules where profile_id=p_member_id;
    delete from recurring_rules where profile_id=p_member_id;
    update service_desks set primary_admin_id=null where primary_admin_id=p_member_id;
    update service_desks set secondary_admin_id=null where secondary_admin_id=p_member_id;
    update profiles set status='Archived' where id=p_member_id;
  else raise exception 'Unsupported lifecycle action.'; end if;
  insert into roster_activity_audit(actor_profile_id,subject_profile_id,event_type,previous_status,new_status,previous_role,new_role)
    values(auth.uid(),p_member_id,'MEMBER_'||v_action,v_member.status,(select status::text from profiles where id=p_member_id),v_member.role::text,(select role::text from profiles where id=p_member_id));
  return jsonb_build_object('member_id',p_member_id,'action',v_action,'status',(select status from profiles where id=p_member_id),'role',(select role from profiles where id=p_member_id),'future_booking_count',v_future,'recurring_rule_count',v_rules,'desk_admin_assignment_count',v_desks);
end; $$;

revoke all on function public.get_member_lifecycle_preview(uuid) from public,anon,authenticated;
grant execute on function public.get_member_lifecycle_preview(uuid) to authenticated;
revoke all on function public.apply_member_lifecycle_transition(uuid,text,app_role,account_status,app_role) from public,anon,authenticated;
grant execute on function public.apply_member_lifecycle_transition(uuid,text,app_role,account_status,app_role) to authenticated;
revoke all on function public.update_member_profile_and_role(uuid,text,text,text,boolean,app_role,account_status,app_role) from public,anon,authenticated;
grant execute on function public.update_member_profile_and_role(uuid,text,text,text,boolean,app_role,account_status,app_role) to authenticated;
revoke update on public.profiles from authenticated;
grant update(full_name,phone,warrant_number,is_provisional) on public.profiles to authenticated;

commit;
