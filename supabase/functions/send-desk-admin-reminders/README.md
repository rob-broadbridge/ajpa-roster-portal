# Desk Admin roster reminders

This Edge Function is called hourly by Supabase Cron. It only sends email when
the current time is midnight in `Pacific/Auckland`, so weekly and fortnightly
preferences continue to run at midnight through daylight-saving changes.

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
