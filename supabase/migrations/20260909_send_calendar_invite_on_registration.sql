-- Email a calendar appointment after a new duty assignment is confirmed.
-- The trigger is asynchronous, so it never delays or prevents registration.

create or replace function public.send_calendar_invite_on_duty_assignment()
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
      'type', 'INSERT',
      'table', 'duty_assignments',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', null
    )
  );

  return new;
end;
$$;

drop trigger if exists send_calendar_invite_on_duty_assignment on public.duty_assignments;

create trigger send_calendar_invite_on_duty_assignment
after insert on public.duty_assignments
for each row
execute function public.send_calendar_invite_on_duty_assignment();
