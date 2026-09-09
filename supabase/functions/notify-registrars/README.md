# Sign-up and member-approval notifications

This function sends an individual Resend email to every approved Registrar when a database trigger reports a newly inserted Pending `profiles` row. It also emails a JP Member when a Registrar changes their profile from Pending to Approved, including the JP Member Help guidance. A confirmed duty registration generates an email with a Google Calendar, Apple Calendar, and Microsoft Outlook-compatible `.ics` appointment attachment.

Set these Edge Function secrets: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `REGISTRAR_WEBHOOK_SECRET`.
Deploy with JWT verification disabled; access is instead protected by the webhook-secret header.
