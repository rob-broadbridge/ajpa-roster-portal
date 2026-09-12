-- Stage 5 verification: all existing regions should show Pacific/Auckland.
select id, name, code, timezone
from public.regions
order by name;
