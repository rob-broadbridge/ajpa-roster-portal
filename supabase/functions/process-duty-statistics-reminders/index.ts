import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Reminder = {
  id: string;
  profile_id: string;
  slot_id: string;
  duty_date: string;
  access_token: string | null;
};

const displayDate = (date: string) => new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
}).format(new Date(`${date}T12:00:00Z`));

const createAccessToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('REGISTRAR_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(100, Number(body?.limit) || 25));
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { error: materializeError } = await supabase.rpc('materialize_due_duty_statistics_reminders');
  if (materializeError) throw materializeError;

  const { data: claimed, error: claimError } = await supabase.rpc('claim_due_duty_statistics_reminders', { p_limit: limit });
  if (claimError) throw claimError;

  const portalUrl = (Deno.env.get('PORTAL_URL') || 'https://ajpa-roster-portal.vercel.app').replace(/\/$/, '');
  const sendEmail = async (payload: Record<string, unknown>, idempotencyKey: string) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), ...payload })
    });
    if (!response.ok) throw new Error(`Resend rejected statistics reminder: ${await response.text()}`);
    return await response.json().catch(() => ({})) as { id?: string };
  };

  const skip = async (reminder: Reminder, reason: string) => {
    const { error } = await supabase.rpc('skip_duty_statistics_reminder', {
      p_reminder_id: reminder.id,
      p_reason: reason
    });
    if (error) throw error;
  };

  const release = async (reminder: Reminder, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const { error: releaseError } = await supabase.rpc('release_duty_statistics_reminder', {
      p_reminder_id: reminder.id,
      p_error: message
    });
    if (releaseError) console.error('Unable to schedule statistics reminder retry:', releaseError.message);
  };

  let sent = 0;
  let skipped = 0;
  for (const reminder of (claimed ?? []) as Reminder[]) {
    try {
      const [assignmentResult, statisticResult, memberResult, slotResult] = await Promise.all([
        supabase.from('duty_assignments').select('profile_id').eq('profile_id', reminder.profile_id).eq('slot_id', reminder.slot_id).eq('duty_date', reminder.duty_date).maybeSingle(),
        supabase.from('duty_statistics').select('id').eq('profile_id', reminder.profile_id).eq('slot_id', reminder.slot_id).eq('duty_date', reminder.duty_date).maybeSingle(),
        supabase.from('profiles').select('full_name, email, status').eq('id', reminder.profile_id).maybeSingle(),
        supabase.from('duty_slots').select('start_time, end_time, desk_id, service_desks(code, name, is_home_based_service)').eq('id', reminder.slot_id).maybeSingle()
      ]);
      const queryFailure = [assignmentResult, statisticResult, memberResult, slotResult].find((result) => result.error);
      if (queryFailure?.error) throw queryFailure.error;

      if (!assignmentResult.data) {
        await skip(reminder, 'The JP is no longer registered for this slot.');
        skipped += 1;
        continue;
      }
      if (statisticResult.data) {
        await skip(reminder, 'Statistics were completed before the reminder was sent.');
        skipped += 1;
        continue;
      }
      if (!memberResult.data?.email || memberResult.data.status !== 'Approved') {
        await skip(reminder, 'The JP account is no longer approved with a usable email address.');
        skipped += 1;
        continue;
      }

      const desk = Array.isArray(slotResult.data?.service_desks)
        ? slotResult.data.service_desks[0]
        : slotResult.data?.service_desks;
      if (!slotResult.data || !desk || desk.is_home_based_service) {
        await skip(reminder, 'This is not an active rostered Service Desk slot.');
        skipped += 1;
        continue;
      }

      let accessToken = reminder.access_token;
      if (!accessToken) {
        accessToken = createAccessToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { error: tokenError } = await supabase
          .from('duty_statistics_reminders')
          .update({ access_token: accessToken, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
          .eq('id', reminder.id)
          .eq('status', 'PROCESSING');
        if (tokenError) throw tokenError;
      }

      const reminderLink = `${portalUrl}/?statsReminder=${encodeURIComponent(accessToken)}`;
      const memberName = memberResult.data.full_name || 'JP Member';
      const time = `${slotResult.data.start_time.slice(0, 5)} - ${slotResult.data.end_time.slice(0, 5)}`;
      const safeMemberName = escapeHtml(memberName);
      const safeDeskName = escapeHtml(desk.name || 'Service Desk');
      const safeDeskCode = escapeHtml(desk.code || 'JP');
      const safeDate = escapeHtml(displayDate(reminder.duty_date));
      const safeTime = escapeHtml(time);
      const text = `Hello ${memberName},\n\nThank you for serving at ${desk.name}.\n\nPlease complete your Statistics for this duty:\n\nService desk: [${desk.code || 'JP'}] ${desk.name}\nDate: ${displayDate(reminder.duty_date)}\nTime: ${time}\n\nUse this secure link to open the correct Statistics form in the AJPA Service Desk Management Platform:\n${reminderLink}\n\nIf another JP also served this slot, they will receive their own reminder and should submit their Statistics separately.\n\nFor your security, please sign in with the account that received this email. This link remains available for 30 days.\n\nRegards,\nAJPA Roster Team`;
      const html = `<p>Hello ${safeMemberName},</p><p>Thank you for serving at <strong>${safeDeskName}</strong>.</p><p>Please complete your Statistics for this duty:</p><p><strong>Service desk:</strong> [${safeDeskCode}] ${safeDeskName}<br><strong>Date:</strong> ${safeDate}<br><strong>Time:</strong> ${safeTime}</p><p><a href="${reminderLink}" style="display:inline-block;background:#f59e0b;color:#0f172a;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Complete Statistics</a></p><p>If another JP also served this slot, they will receive their own reminder and should submit their Statistics separately.</p><p style="color:#475569;font-size:13px">For your security, please sign in with the account that received this email. This link remains available for 30 days.</p><p>Regards,<br>AJPA Roster Team</p>`;
      const response = await sendEmail({
        to: [memberResult.data.email],
        subject: `Please complete your JP duty Statistics — ${desk.name}, ${reminder.duty_date}`,
        text,
        html
      }, `duty-statistics-reminder-${reminder.id}`);

      const { error: completeError } = await supabase.rpc('complete_duty_statistics_reminder', {
        p_reminder_id: reminder.id,
        p_resend_email_id: response.id ?? null
      });
      if (completeError) throw completeError;
      sent += 1;
    } catch (error) {
      console.error(`Duty statistics reminder ${reminder.id} failed:`, error);
      await release(reminder, error);
    }
  }

  return Response.json({ claimed: claimed?.length ?? 0, sent, skipped });
});
