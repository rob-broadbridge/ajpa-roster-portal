# Registrar sign-up notifications

This function sends an individual Resend email to every approved Registrar when a database trigger reports a newly inserted Pending `profiles` row.

Set these Edge Function secrets: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `REGISTRAR_WEBHOOK_SECRET`.
Deploy with JWT verification disabled; access is instead protected by the webhook-secret header.
