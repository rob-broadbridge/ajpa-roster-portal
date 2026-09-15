-- Stage 21D verification: both results should be clean.

-- Expected: one trigger named profiles_normalise_jp_warrant_number.
select trigger_name, event_manipulation, action_timing
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'profiles'
  and trigger_name = 'profiles_normalise_jp_warrant_number'
order by event_manipulation;

-- Expected: no rows. Every populated warrant must use JP- followed by digits.
select id, full_name, warrant_number
from public.profiles
where warrant_number is not null
  and warrant_number !~ '^JP-[0-9]+$'
order by full_name;

-- Expected: one row for the new five-argument My Profile function.
select p.oid::regprocedure as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_my_profile'
  and p.oid::regprocedure::text = 'update_my_profile(text,text,text,date,integer)';
