-- Stage 7 verification: browser roles must not be able to call the old
-- account-lookup function. Only the server-side service role may use it.
select
  has_function_privilege('anon', 'public.is_registered_email(text)'::regprocedure, 'execute') as anonymous_can_lookup_accounts,
  has_function_privilege('authenticated', 'public.is_registered_email(text)'::regprocedure, 'execute') as signed_in_can_lookup_accounts,
  has_function_privilege('service_role', 'public.is_registered_email(text)'::regprocedure, 'execute') as server_can_lookup_accounts;
