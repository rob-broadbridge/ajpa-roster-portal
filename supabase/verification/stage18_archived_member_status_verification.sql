-- Stage 18 verification: Archived must be accepted and existing profiles
-- must be accounted for before the portal archive control is tested.

select
  status,
  count(*) as members
from public.profiles
group by status
order by status;
