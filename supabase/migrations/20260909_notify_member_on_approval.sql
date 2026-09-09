-- Notify a member only when a Registrar approves a Pending profile.
-- This reuses the existing notify-registrars Edge Function and its Vault secret.

create or replace function public.notify_member_on_profile_approval()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret
  into webhook_secret
  from vault.decrypted_secrets
  where name = 'registrar_webhook_secret'
  limit 1;

  if webhook_secret is null then
    raise exception 'The registrar webhook secret has not been configured.';
  end if;

  perform net.http_post(
    url := 'https://pdffmqafznvrblxxptvf.supabase.co/functions/v1/notify-registrars',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'profiles',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_member_on_profile_approval on public.profiles;

create trigger notify_member_on_profile_approval
after update of status on public.profiles
for each row
when (old.status = 'Pending' and new.status = 'Approved')
execute function public.notify_member_on_profile_approval();
