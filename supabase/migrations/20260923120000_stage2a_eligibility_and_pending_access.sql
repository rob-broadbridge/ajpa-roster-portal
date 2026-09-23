-- Stage 2A only: eligibility, Pending profile access and scoped audit reads.
-- Apply once to the verified production-shaped schema, NOT to an empty database.
-- No historical migrations are replayed. Stage 2B/2C/2D are deliberately deferred.
begin;

-- Stop rather than overwrite drift. Hashes are normalized prosrc bodies captured
-- during Stage 1; harmless formatting drift also requires an explicit review.
do $preflight$
declare expected record; actual text; relation_name text;
begin
  for expected in select * from (values
    ('public.get_roster_member_directory_for_current_user()', '385a5fbd615d56ef167a194a187aef8d'),
    ('public.save_duty_statistic_for_member(uuid,uuid,uuid,date,jsonb)', '523481f82dee02bf39f10d4a6c2c5a70'),
    ('public.delete_duty_statistic_for_member(uuid)', 'dde6842478528d2188a37ee417792c3b'),
    ('public.get_roster_activity_audit_for_current_user(integer,date,date)', '0647c55c29cb8bd86dcfcd03be2e6f09'),
    ('public.get_incomplete_duty_statistics_for_current_user()', 'c27d359127fcbe16d0bc44e92e5e028a'),
    ('public.update_my_profile(text,text,date,integer)', '2138c60d7b35c9fca48dd1f335c5b759'),
    ('public.update_my_profile(text,text,text,date,integer)', 'fd5ae2da728271b3d82e05a5e6b6627f'),
    ('public.is_approved_registrar()', '5783e687791427055ba1a27469a0692f'),
    ('public.is_assigned_desk_admin(uuid)', 'f4e7865ee03f0138c4eb30a953198827'),
    ('public.is_registrar_or_assigned_desk_admin(uuid)', 'a7a416cb96e7b8f60c30830c7c2aa28f'),
    ('public.is_manager()', 'e31cee773894034af55e6aeb18aee6e4'),
    ('public.get_desk_follower_contacts_for_current_user(uuid)', '023356d9222d9f1a63f4e97035cf12e8'),
    ('public.get_roster_operational_health()', 'd71d95d59cb6777b488a0d5efa87146a'),
    ('public.get_duty_notification_failures(integer)', '4584f70fe5fb7a3d7e68c66b11d6a8e2'),
    ('public.retry_failed_duty_notification(uuid)', 'f1722b57aa27c4806dc13b6614c7dd86'),
    ('public.get_duty_statistics_reminder_target(text)', 'efd8dcccbc1e2a4a78a59b30f6fc4a5c'),
    ('public.apply_duty_assignment_change(text,uuid,date,text,integer,date)', '8fe9b7f52878f6ed33c24621dd23e904'),
    ('public.apply_duty_assignment_change_for_member(uuid,text,uuid,date)', '94e345d059126d9fa0f0b60ecce71226'),
    ('public.save_home_based_duty_statistic(uuid,date,time without time zone,jsonb)', '4f7794d46c663c9b4b5b80fa83192698')
  ) as definitions(signature, body_hash) loop
    select md5(btrim(replace(p.prosrc, E'\r\n', E'\n'), E' \t\r\n')) into actual
      from pg_proc p where p.oid = to_regprocedure(expected.signature);
    if actual is distinct from expected.body_hash then
      raise exception 'Stage 2A preflight: function missing or changed: %', expected.signature;
    end if;
  end loop;
  foreach relation_name in array array['desk_admin_monthly_statistics_reports', 'desk_admin_reminder_deliveries', 'desk_follows', 'duty_assignment_notifications', 'duty_assignments', 'duty_cancellations', 'duty_slot_holiday_overrides', 'duty_slots', 'duty_statistics', 'duty_statistics_reminder_settings', 'duty_statistics_reminders', 'recurring_rules', 'regions', 'roster_activity_audit', 'service_desks', 'statutory_holidays', 'user_preferences', 'profiles'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=relation_name and c.relkind='r' and c.relrowsecurity) then
      raise exception 'Stage 2A preflight: expected RLS table missing/incompatible: %', relation_name;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='profiles'
      and policyname not in ('own_or_registrar_read_profiles','registrar_manage_profiles'))
    or not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles'
      and policyname='registrar_manage_profiles' and qual='is_approved_registrar()' and with_check='is_approved_registrar()')
    or not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles'
      and policyname='own_or_registrar_read_profiles' and qual='((id = auth.uid()) OR is_approved_registrar())') then
    raise exception 'Stage 2A preflight: profile policies require review';
  end if;
  if to_regprocedure('public.is_approved_member()') is not null
    or to_regprocedure('public.update_pending_profile(text,text,text,boolean)') is not null then
    raise exception 'Stage 2A preflight: new API already exists; inspect deployment state';
  end if;
end;
$preflight$;

create function public.is_approved_member()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id=auth.uid() and status='Approved');
$$;
revoke all on function public.is_approved_member() from public, anon, authenticated;
grant execute on function public.is_approved_member() to authenticated, service_role;

-- Restrictive policies intersect ALL existing permissive policies. Existing
-- row scopes remain intact; even a legacy permissive policy cannot admit an
-- inactive authenticated actor. Owners/service workers retain existing behaviour.
create policy stage2a_approved_actor on public.desk_admin_monthly_statistics_reports
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.desk_admin_reminder_deliveries
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.desk_follows
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.duty_assignment_notifications
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.duty_assignments
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.duty_cancellations
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.duty_slot_holiday_overrides
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.duty_slots
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.duty_statistics
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.duty_statistics_reminder_settings
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.duty_statistics_reminders
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.recurring_rules
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.regions
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.roster_activity_audit
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.service_desks
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.statutory_holidays
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());
create policy stage2a_approved_actor on public.user_preferences
  as restrictive for all to authenticated
  using (public.is_approved_member()) with check (public.is_approved_member());

-- Remove the direct administrative audit path, including the old broad policy.
revoke select on table public.roster_activity_audit from public, anon, authenticated;
drop policy if exists roster_activity_audit_admin_read on public.roster_activity_audit;
-- Explicit column SELECT grants would survive a table-level revoke.
do $audit_columns$
declare col record;
begin
  for col in select attname from pg_attribute where attrelid='public.roster_activity_audit'::regclass
    and attnum>0 and not attisdropped loop
    execute format('revoke select (%I) on public.roster_activity_audit from public, anon, authenticated', col.attname);
  end loop;
end;
$audit_columns$;

drop policy statutory_holidays_registrar_write on public.statutory_holidays;
create policy statutory_holidays_registrar_write on public.statutory_holidays
  for all to authenticated using (public.is_approved_registrar()) with check (public.is_approved_registrar());

-- This helper is internal to occurrence/worker processing, not a browser API.
-- Preserve its body so materialisation without an end-user JWT still works.
revoke execute on function public.is_duty_slot_holiday(uuid,date) from public, anon, authenticated;
grant execute on function public.is_duty_slot_holiday(uuid,date) to service_role;

CREATE OR REPLACE FUNCTION public.get_roster_member_directory_for_current_user()
 RETURNS TABLE(id uuid, full_name text, warrant_number text, email text, phone text, role text, status text, is_provisional boolean, is_approved boolean, can_be_desk_admin boolean, reminder_frequency text, reminder_start_date date, reminder_weeks integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with actor as (
    select public.is_approved_registrar() as is_registrar
  )
  select
    member.id,
    member.full_name,
    member.warrant_number,
    case when actor.is_registrar then member.email else null end,
    case when actor.is_registrar then member.phone else null end,
    case when actor.is_registrar then member.role::text else null end,
    case when actor.is_registrar then member.status::text else null end,
    case when actor.is_registrar then member.is_provisional else false end,
    member.status = 'Approved' as is_approved,
    member.status = 'Approved' and member.role in ('Admin', 'Registrar') as can_be_desk_admin,
    case when actor.is_registrar then member.desk_admin_reminder_frequency else null end,
    case when actor.is_registrar then member.desk_admin_reminder_start_date else null end,
    case when actor.is_registrar then member.desk_admin_reminder_weeks else null end
  from public.profiles as member
  cross join actor
  where public.is_approved_member()
    and (actor.is_registrar or member.status = 'Approved' or member.id = auth.uid())
  order by member.full_name;
$function$;
revoke all on function public.get_roster_member_directory_for_current_user() from public, anon;
grant execute on function public.get_roster_member_directory_for_current_user() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_duty_statistic_for_member(p_statistic_id uuid, p_member_id uuid, p_slot_id uuid, p_duty_date date, p_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_desk_id uuid;
  v_desk_name text;
  v_desk_code text;
  v_start_time time;
  v_end_time time;
  v_statistic_id uuid;
begin
  if not public.is_approved_member() then
    raise exception using errcode='42501', message='Approved membership is required for this operation.';
  end if;
  select slot.desk_id, desk.name, desk.code, slot.start_time, slot.end_time
  into v_desk_id, v_desk_name, v_desk_code, v_start_time, v_end_time
  from public.duty_slots slot
  join public.service_desks desk on desk.id = slot.desk_id
  where slot.id = p_slot_id;

  if v_actor_id is null or v_desk_id is null then
    raise exception 'A valid signed-in user and duty slot are required.';
  end if;
  if v_actor_id <> p_member_id and not public.is_registrar_or_assigned_desk_admin(v_desk_id) then
    raise exception 'You are not an assigned Desk Admin for this Service Desk.';
  end if;
  if not exists (select 1 from public.profiles where id = p_member_id) then
    raise exception 'The selected JP member does not exist.';
  end if;

  if p_statistic_id is null then
    if not exists (select 1 from public.duty_assignments where profile_id = p_member_id and slot_id = p_slot_id and duty_date = p_duty_date) then
      raise exception 'Statistics can only be added for a JP member registered for this slot.';
    end if;
    insert into public.duty_statistics (
      profile_id, slot_id, duty_date,
      desk_name_snapshot, desk_code_snapshot, start_time_snapshot, end_time_snapshot,
      no_of_clients, no_of_hours_worked, certified_copies, statutory_declarations,
      signatures_witnessed, affidavits, other_duties, notes
    ) values (
      p_member_id, p_slot_id, p_duty_date,
      v_desk_name, v_desk_code, v_start_time, v_end_time,
      coalesce((p_values->>'noOfClients')::integer, 0),
      coalesce((p_values->>'noOfHoursWorked')::numeric, 0),
      coalesce((p_values->>'certifiedCopies')::integer, 0),
      coalesce((p_values->>'statutoryDeclarations')::integer, 0),
      coalesce((p_values->>'signatureWitnessed')::integer, 0),
      coalesce((p_values->>'affidavits')::integer, 0),
      coalesce((p_values->>'other')::integer, 0),
      coalesce(p_values->>'notes', '')
    ) returning id into v_statistic_id;
  else
    select id into v_statistic_id from public.duty_statistics
    where id = p_statistic_id and profile_id = p_member_id and slot_id = p_slot_id and duty_date = p_duty_date;
    if v_statistic_id is null then raise exception 'The statistics record could not be found.'; end if;
    update public.duty_statistics set
      no_of_clients = coalesce((p_values->>'noOfClients')::integer, 0),
      no_of_hours_worked = coalesce((p_values->>'noOfHoursWorked')::numeric, 0),
      certified_copies = coalesce((p_values->>'certifiedCopies')::integer, 0),
      statutory_declarations = coalesce((p_values->>'statutoryDeclarations')::integer, 0),
      signatures_witnessed = coalesce((p_values->>'signatureWitnessed')::integer, 0),
      affidavits = coalesce((p_values->>'affidavits')::integer, 0),
      other_duties = coalesce((p_values->>'other')::integer, 0),
      notes = coalesce(p_values->>'notes', '')
    where id = v_statistic_id;
  end if;
  return v_statistic_id;
end;
$function$;
revoke all on function public.save_duty_statistic_for_member(uuid,uuid,uuid,date,jsonb) from public, anon;
grant execute on function public.save_duty_statistic_for_member(uuid,uuid,uuid,date,jsonb) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_duty_statistic_for_member(p_statistic_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_stat record;
begin
  if not public.is_approved_member() then
    raise exception using errcode='42501', message='Approved membership is required for this operation.';
  end if;
  select statistic.id,statistic.profile_id,slot.desk_id into v_stat from public.duty_statistics statistic join public.duty_slots slot on slot.id=statistic.slot_id where statistic.id=p_statistic_id;
  if not found then raise exception 'The statistics record could not be found.'; end if;
  if auth.uid() <> v_stat.profile_id and not public.is_registrar_or_assigned_desk_admin(v_stat.desk_id) then raise exception 'You are not an assigned Desk Admin for this Service Desk.'; end if;
  delete from public.duty_statistics where id=p_statistic_id;
end;
$function$;
revoke all on function public.delete_duty_statistic_for_member(uuid) from public, anon;
grant execute on function public.delete_duty_statistic_for_member(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_roster_activity_audit_for_current_user(p_limit integer DEFAULT 250, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date)
 RETURNS SETOF roster_activity_audit
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select audit.* from public.roster_activity_audit audit
  where (public.is_approved_registrar() or exists (select 1 from public.duty_slots slot where slot.id=audit.duty_slot_id and public.is_assigned_desk_admin(slot.desk_id)))
  and (p_from_date is null or audit.occurred_at >= p_from_date::timestamptz)
  and (p_to_date is null or audit.occurred_at < (p_to_date+1)::timestamptz)
  order by audit.occurred_at desc limit least(greatest(coalesce(p_limit,250),1),1000);
$function$;
revoke all on function public.get_roster_activity_audit_for_current_user(integer,date,date) from public, anon;
grant execute on function public.get_roster_activity_audit_for_current_user(integer,date,date) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_incomplete_duty_statistics_for_current_user()
 RETURNS TABLE(member_id uuid, member_name text, warrant_number text, slot_id uuid, duty_date date, desk_id uuid, desk_name text, desk_code text, start_time time without time zone, end_time time without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    member.id,
    member.full_name,
    member.warrant_number,
    slot.id,
    assignment.duty_date,
    desk.id,
    desk.name,
    desk.code,
    slot.start_time,
    slot.end_time
  from public.duty_assignments as assignment
  join public.duty_slots as slot on slot.id = assignment.slot_id
  join public.service_desks as desk on desk.id = slot.desk_id
  left join public.regions as region on region.id = desk.region_id
  join public.profiles as member on member.id = assignment.profile_id
  where assignment.duty_date + slot.end_time <= timezone(coalesce(region.timezone, 'Pacific/Auckland'), now())
    and not exists (
      select 1
      from public.duty_statistics as statistic
      where statistic.profile_id = assignment.profile_id
        and statistic.slot_id = assignment.slot_id
        and statistic.duty_date = assignment.duty_date
    )
    and public.is_registrar_or_assigned_desk_admin(desk.id)
  order by assignment.duty_date desc, slot.start_time desc, desk.name, member.full_name;
$function$;
revoke all on function public.get_incomplete_duty_statistics_for_current_user() from public, anon;
grant execute on function public.get_incomplete_duty_statistics_for_current_user() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_my_profile(p_phone text, p_reminder_frequency text, p_reminder_start_date date, p_reminder_weeks integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  is_desk_admin boolean;
begin
  if not public.is_approved_member() then
    raise exception using errcode='42501', message='Approved membership is required for this operation.';
  end if;
  if auth.uid() is null then
    raise exception 'No profile was found for the signed-in user.';
  end if;

  if p_reminder_frequency not in ('NONE', 'WEEKLY', 'FORTNIGHTLY') then
    raise exception 'Invalid Desk Admin reminder frequency.';
  end if;

  if p_reminder_weeks not between 1 and 52 then
    raise exception 'Weeks to report on must be between 1 and 52.';
  end if;

  select exists (
    select 1
    from public.service_desks
    where primary_admin_id = auth.uid()
       or secondary_admin_id = auth.uid()
  ) into is_desk_admin;

  update public.profiles
  set phone = nullif(trim(coalesce(p_phone, '')), ''),
      desk_admin_reminder_frequency = case
        when is_desk_admin then p_reminder_frequency else 'NONE'
      end,
      desk_admin_reminder_start_date = case
        when is_desk_admin and p_reminder_frequency <> 'NONE' then p_reminder_start_date else null
      end,
      desk_admin_reminder_weeks = case
        when is_desk_admin then p_reminder_weeks else 4
      end
  where id = auth.uid();

  if not found then
    raise exception 'Your application profile could not be found.';
  end if;
end;
$function$;
revoke all on function public.update_my_profile(text,text,date,integer) from public, anon;
grant execute on function public.update_my_profile(text,text,date,integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_my_profile(p_phone text, p_warrant_number text, p_reminder_frequency text, p_reminder_start_date date, p_reminder_weeks integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  is_desk_admin boolean;
begin
  if not public.is_approved_member() then
    raise exception using errcode='42501', message='Approved membership is required for this operation.';
  end if;
  if auth.uid() is null then
    raise exception 'No profile was found for the signed-in user.';
  end if;

  if p_reminder_frequency not in ('NONE', 'WEEKLY', 'FORTNIGHTLY') then
    raise exception 'Invalid Desk Admin reminder frequency.';
  end if;

  if p_reminder_weeks not between 1 and 52 then
    raise exception 'Weeks to report on must be between 1 and 52.';
  end if;

  select exists (
    select 1
    from public.service_desks
    where primary_admin_id = auth.uid()
       or secondary_admin_id = auth.uid()
  ) into is_desk_admin;

  update public.profiles
  set phone = nullif(trim(coalesce(p_phone, '')), ''),
      warrant_number = p_warrant_number,
      desk_admin_reminder_frequency = case
        when is_desk_admin then p_reminder_frequency else 'NONE'
      end,
      desk_admin_reminder_start_date = case
        when is_desk_admin and p_reminder_frequency <> 'NONE' then p_reminder_start_date else null
      end,
      desk_admin_reminder_weeks = case
        when is_desk_admin then p_reminder_weeks else 4
      end
  where id = auth.uid();

  if not found then
    raise exception 'Your application profile could not be found.';
  end if;
end;
$function$;
revoke all on function public.update_my_profile(text,text,text,date,integer) from public, anon;
grant execute on function public.update_my_profile(text,text,text,date,integer) to authenticated, service_role;

-- Pending users cannot use operational profile/reminder RPCs. This separate
-- whitelist never writes role, status, desk assignments or reminder preferences.
create function public.update_pending_profile(p_full_name text, p_phone text, p_warrant_number text, p_is_provisional boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare actor_status public.account_status;
begin
  select status into actor_status from public.profiles where id=auth.uid() for update;
  if actor_status is distinct from 'Pending'::public.account_status then
    raise exception using errcode='42501', message='This operation is only available to your own Pending application.';
  end if;
  if nullif(btrim(p_full_name),'') is null or nullif(btrim(p_warrant_number),'') is null then
    raise exception 'Name and JP warrant number are required.';
  end if;
  update public.profiles set full_name=btrim(p_full_name), phone=nullif(btrim(p_phone),''),
    warrant_number=p_warrant_number, is_provisional=coalesce(p_is_provisional,false)
    where id=auth.uid();
end;
$$;
revoke all on function public.update_pending_profile(text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.update_pending_profile(text,text,text,boolean) to authenticated;

-- Existing Approved-Registrar direct profile changes remain until Stage 2C
-- replaces them atomically. No archive cleanup, recurrence or succession changes.
commit;
