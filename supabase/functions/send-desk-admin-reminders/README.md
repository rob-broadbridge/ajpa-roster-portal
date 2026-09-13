# Desk Admin roster reminders

This Edge Function is called hourly by Supabase Cron. New weekly and
fortnightly reports are created only at midnight in `Pacific/Auckland`, so
preferences continue to run at midnight through daylight-saving changes.
Queued retries are processed on the later hourly checks when their retry time
is reached.

Each Desk Admin/reporting-period email is recorded before it is sent. This
prevents duplicate reminders if the hourly check overlaps with a manual test
or is retried. Transient sending failures are retried automatically, without
stopping reminders for other Desk Admins.

It uses the existing Edge Function secrets:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `REGISTRAR_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` (provided by Supabase for the Edge Function)

Deploy with JWT verification disabled. The database cron request is protected
with the `x-webhook-secret` header.

For an immediate, real email test after deployment, run this in Supabase SQL
Editor (it honours the configured start date and reminder frequency):

```sql
select public.invoke_desk_admin_reminder_check(true);
```
