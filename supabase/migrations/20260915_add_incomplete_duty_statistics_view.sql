-- Staff-only historical list of completed registered shifts that still need
-- a statistics record. It is evaluated in the service desk's region timezone.

create or replace function public.get_incomplete_duty_statistics_for_current_user()
returns table (
  member_id uuid,
  member_name text,
  warrant_number text,
  slot_id uuid,
  duty_date date,
  desk_id uuid,
  desk_name text,
  desk_code text,
  start_time time,
  end_time time
)
language sql
security definer
set search_path = public
stable
as $$
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
    and (
      exists (
        select 1 from public.profiles as caller
        where caller.id = auth.uid()
          and caller.status = 'Approved'
          and caller.role = 'Registrar'
      )
      or exists (
        select 1 from public.profiles as caller
        where caller.id = auth.uid()
          and caller.status = 'Approved'
          and (desk.primary_admin_id = caller.id or desk.secondary_admin_id = caller.id)
      )
    )
  order by assignment.duty_date desc, slot.start_time desc, desk.name, member.full_name;
$$;

revoke all on function public.get_incomplete_duty_statistics_for_current_user() from public, anon;
grant execute on function public.get_incomplete_duty_statistics_for_current_user() to authenticated;
