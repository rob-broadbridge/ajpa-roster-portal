-- Keep the recorded JP duty count consistent with the hours worked:
-- one duty for every complete or partial two-hour block.

create or replace function public.calculate_jp_duties_from_hours()
returns trigger
language plpgsql
as $$
begin
  new.no_of_jp_duties := case
    when coalesce(new.no_of_hours_worked, 0) <= 0 then 0
    else ceil(new.no_of_hours_worked / 2.0)::integer
  end;
  return new;
end;
$$;

drop trigger if exists calculate_jp_duties_from_hours on public.duty_statistics;

create trigger calculate_jp_duties_from_hours
before insert or update of no_of_hours_worked on public.duty_statistics
for each row
execute function public.calculate_jp_duties_from_hours();
