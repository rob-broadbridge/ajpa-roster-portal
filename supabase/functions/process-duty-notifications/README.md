# Delayed duty notifications

`process-duty-notifications` is invoked by the database once per minute. It is
not called by a browser, so confirmation and cancellation delivery continues
when the portal is closed.

It uses the existing Edge Function secrets:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `REGISTRAR_WEBHOOK_SECRET`

Deploy with **Verify JWT** turned off. Requests are protected by the
`x-webhook-secret` header supplied by the database cron job.

The accompanying migration creates the notification queue and the cron job.
It delays confirmation emails for five minutes, skips them if the assignment
has been withdrawn, sends a cancellation email only after a confirmation was
sent, and alerts the relevant Desk Admins only if a cancellation within seven
days leaves the slot below its minimum staffing level.

Each message captures an immutable recipient and duty snapshot before its first
attempt. Retries therefore reuse the same Resend idempotency key and payload.
Failed delivery is retried after 1, 5 and 30 minutes, then 2 hours; after five
failed attempts it stops and is marked `FAILED` for Registrar follow-up.

After applying the Stage 3B retry migration, Registrars can see permanently
failed messages in **Registrar Portal → Email Delivery** and return a corrected
item to the secure queue. The worker retains the original recipient snapshot
and still confirms that a booking exists before sending a delayed confirmation.
