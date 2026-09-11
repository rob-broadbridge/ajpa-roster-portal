-- Schedule the Desk Admin reminder check once per hour. The Edge Function
-- itself sends only at midnight Pacific/Auckland, which keeps the schedule
-- correct during both NZST and NZDT.
--
-- This migration expects the existing Vault secret named
-- `registrar_webhook_secret`, used by the other AJPA Edge Function webhooks.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_desk_admin_reminder_check(p_force boolean default false)
returns void
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
    raise exception 'Vault secret registrar_webhook_secret was not found.';
  end if;

  perform net.http_post(
    url := 'https://pdffmqafznvrblxxptvf.supabase.co/functions/v1/send-desk-admin-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object('force', p_force)
  );
end;
$$;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'ajpa-desk-admin-reminders-hourly'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'ajpa-desk-admin-reminders-hourly',
  '0 * * * *',
  $$select public.invoke_desk_admin_reminder_check();$$
);
