import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Snapshot = { version: 1; member: { id: string; fullName: string; email: string }; slot: { id: string; startTime: string; endTime: string; minJps: number }; desk: { id: string; code: string; name: string; address: string }; deskAdminEmails: string[] };
type Notification = { id: string; profile_id: string; slot_id: string; duty_date: string; status: string; created_at: string; desk_admin_alert_required: boolean; member_cancellation_sent_at: string | null; desk_admin_alert_sent_at: string | null; payload_snapshot: Snapshot | null };

const escapeIcsText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const foldIcsLine = (line: string) => {
  const encoder = new TextEncoder(); const folded: string[] = []; let current = '';
  for (const character of line) { if (current && encoder.encode(`${current}${character}`).length > 73) { folded.push(current); current = ` ${character}`; } else current += character; }
  folded.push(current); return folded.join('\r\n');
};
const toIcsDateTime = (date: string, time: string) => `${date.replaceAll('-', '')}T${time.replaceAll(':', '').slice(0, 4)}00`;
const toBase64 = (value: string) => { const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); };
const displayDate = (date: string) => new Intl.DateTimeFormat('en-NZ', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`));

const buildCalendarInvite = ({ profileId, slotId, dutyDate, startTime, endTime, deskName, deskAddress, createdAt }: { profileId: string; slotId: string; dutyDate: string; startTime: string; endTime: string; deskName: string; deskAddress: string; createdAt: string }) => {
  const location = `${deskName}, ${deskAddress}`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  const stamp = new Date(createdAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AJPA//Service Desk Management Platform//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-TIMEZONE:Pacific/Auckland', 'BEGIN:VTIMEZONE', 'TZID:Pacific/Auckland', 'X-LIC-LOCATION:Pacific/Auckland', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+1200', 'TZOFFSETTO:+1300', 'TZNAME:NZDT', 'DTSTART:19700927T020000', 'RRULE:FREQ=YEARLY;BYMONTH=9;BYDAY=-1SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:+1300', 'TZOFFSETTO:+1200', 'TZNAME:NZST', 'DTSTART:19700405T030000', 'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE', 'BEGIN:VEVENT', `UID:ajpa-duty-${profileId}-${slotId}-${dutyDate}@contact.broadbridge.co.nz`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Pacific/Auckland:${toIcsDateTime(dutyDate, startTime)}`, `DTEND;TZID=Pacific/Auckland:${toIcsDateTime(dutyDate, endTime)}`, `SUMMARY:${escapeIcsText(`JP duty - ${deskName}`)}`, `LOCATION:${escapeIcsText(location)}`, `DESCRIPTION:${escapeIcsText(`Confirmed JP duty at ${deskName}.\nAddress: ${deskAddress}\nMap: ${mapLink}`)}`, 'STATUS:CONFIRMED', 'SEQUENCE:0', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR'];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('REGISTRAR_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });
  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(100, Number(body?.limit) || 25));
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: claimed, error: claimError } = await supabase.rpc('claim_due_duty_notifications', { p_limit: limit });
  if (claimError) throw claimError;

  const sendEmail = async (payload: Record<string, unknown>, idempotencyKey: string) => {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), ...payload }) });
    if (!response.ok) throw new Error(`Resend rejected duty notification: ${await response.text()}`);
    return (await response.json().catch(() => ({}))) as { id?: string };
  };

  const getSnapshot = async (notification: Notification): Promise<Snapshot> => {
    if (notification.payload_snapshot?.version === 1) return notification.payload_snapshot;
    const [memberResult, slotResult] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('id', notification.profile_id).single(),
      supabase.from('duty_slots').select('id, desk_id, start_time, end_time, min_jps').eq('id', notification.slot_id).single(),
    ]);
    if (memberResult.error) throw memberResult.error;
    if (slotResult.error) throw slotResult.error;
    const { data: desk, error: deskError } = await supabase.from('service_desks').select('id, code, name, address, primary_admin_id, secondary_admin_id').eq('id', slotResult.data.desk_id).single();
    if (deskError) throw deskError;
    const adminIds = [...new Set([desk.primary_admin_id, desk.secondary_admin_id].filter(Boolean))];
    const { data: admins, error: adminsError } = adminIds.length ? await supabase.from('profiles').select('email').in('id', adminIds).eq('status', 'Approved') : { data: [], error: null };
    if (adminsError) throw adminsError;
    const snapshot: Snapshot = { version: 1, member: { id: memberResult.data.id, fullName: memberResult.data.full_name || 'JP Member', email: memberResult.data.email }, slot: { id: slotResult.data.id, startTime: slotResult.data.start_time.slice(0, 5), endTime: slotResult.data.end_time.slice(0, 5), minJps: slotResult.data.min_jps }, desk: { id: desk.id, code: desk.code || 'JP', name: desk.name, address: desk.address || 'Auckland, New Zealand' }, deskAdminEmails: [...new Set((admins ?? []).map((admin) => admin.email?.trim().toLowerCase()).filter(Boolean))] };
    const { error: snapshotError } = await supabase.from('duty_assignment_notifications').update({ payload_snapshot: snapshot, updated_at: new Date().toISOString() }).eq('id', notification.id);
    if (snapshotError) throw snapshotError;
    return snapshot;
  };
  const release = async (notification: Notification, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const { error: releaseError } = await supabase.rpc('release_duty_notification', { p_notification_id: notification.id, p_error: message });
    if (releaseError) console.error('Unable to schedule notification retry:', releaseError.message);
  };

  let confirmations = 0; let cancellations = 0; let deskAlerts = 0; let skipped = 0;
  for (const notification of (claimed ?? []) as Notification[]) {
    try {
      if (notification.status === 'PROCESSING_CONFIRMATION') {
        const { data: assignment, error: assignmentError } = await supabase.from('duty_assignments').select('profile_id').eq('profile_id', notification.profile_id).eq('slot_id', notification.slot_id).eq('duty_date', notification.duty_date).maybeSingle();
        if (assignmentError) throw assignmentError;
        if (!assignment) {
          await supabase.from('duty_assignment_notifications').update({ status: 'CANCELLED_BEFORE_CONFIRMATION', processing_started_at: null, updated_at: new Date().toISOString() }).eq('id', notification.id).eq('status', 'PROCESSING_CONFIRMATION');
          skipped += 1; continue;
        }
        const snapshot = await getSnapshot(notification);
        const calendarInvite = buildCalendarInvite({ profileId: snapshot.member.id, slotId: snapshot.slot.id, dutyDate: notification.duty_date, startTime: snapshot.slot.startTime, endTime: snapshot.slot.endTime, deskName: snapshot.desk.name, deskAddress: snapshot.desk.address, createdAt: notification.created_at });
        const response = await sendEmail({ to: [snapshot.member.email], subject: `JP duty confirmed — ${snapshot.desk.name}, ${notification.duty_date}`, text: `Hello ${snapshot.member.fullName},\n\nYour JP duty registration has been confirmed.\n\nJP duty - ${snapshot.desk.name}\nDate: ${notification.duty_date}\nTime: ${snapshot.slot.startTime} - ${snapshot.slot.endTime}\nLocation: ${snapshot.desk.name}, ${snapshot.desk.address}\n\nA calendar appointment is attached. Open the .ics file to add it to Google Calendar, Apple Calendar, or Microsoft Outlook. You can still download an appointment from the portal whenever you prefer.\n\nRegards,\nAJPA Roster Team`, attachments: [{ filename: `JP-duty-${notification.duty_date}-${snapshot.desk.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.ics`, content: toBase64(calendarInvite), content_type: 'text/calendar; charset=utf-8; method=PUBLISH' }] }, `duty-confirmation-${notification.id}`);
        const { error: completeError } = await supabase.rpc('complete_duty_confirmation', { p_notification_id: notification.id, p_resend_confirmation_id: response.id ?? null });
        if (completeError) throw completeError;
        confirmations += 1; continue;
      }
      if (notification.status === 'PROCESSING_CANCELLATION') {
        const snapshot = await getSnapshot(notification);
        if (!notification.member_cancellation_sent_at) {
          await sendEmail({ to: [snapshot.member.email], subject: `JP duty cancelled — ${snapshot.desk.name}, ${notification.duty_date}`, text: `Hello ${snapshot.member.fullName},\n\nYour JP duty registration has been cancelled.\n\nJP duty - ${snapshot.desk.name}\nDate: ${displayDate(notification.duty_date)}\nTime: ${snapshot.slot.startTime} - ${snapshot.slot.endTime}\nLocation: ${snapshot.desk.name}, ${snapshot.desk.address}\n\nIf you added this duty to your personal calendar using the email attachment or the portal's Add to Cal option, please delete that appointment yourself. The roster system cannot remove appointments from your personal calendar.\n\nRegards,\nAJPA Roster Team` }, `duty-cancellation-member-${notification.id}`);
          const { error: updateError } = await supabase.from('duty_assignment_notifications').update({ member_cancellation_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', notification.id);
          if (updateError) throw updateError;
          cancellations += 1;
        }
        if (notification.desk_admin_alert_required && !notification.desk_admin_alert_sent_at && snapshot.deskAdminEmails.length) {
          const { count: registered, error: countError } = await supabase.from('duty_assignments').select('*', { count: 'exact', head: true }).eq('slot_id', notification.slot_id).eq('duty_date', notification.duty_date);
          if (countError) throw countError;
          if ((registered ?? 0) < snapshot.slot.minJps) {
            await sendEmail({ to: snapshot.deskAdminEmails, subject: `AJPA action needed: ${snapshot.desk.name} slot below minimum`, text: `Hello Desk Admin,\n\nA JP has withdrawn from a duty within the next seven days, leaving this slot below its minimum staffing requirement.\n\nService desk: [${snapshot.desk.code}] ${snapshot.desk.name}\nDate: ${displayDate(notification.duty_date)}\nTime: ${snapshot.slot.startTime} - ${snapshot.slot.endTime}\nCurrently registered: ${registered ?? 0}\nMinimum required: ${snapshot.slot.minJps}\n\nPlease sign in to the AJPA Service Desk Management Platform to review the roster and arrange cover if required.\n\nRegards,\nAJPA Roster Team` }, `duty-cancellation-desk-${notification.id}`);
            deskAlerts += snapshot.deskAdminEmails.length;
          }
          const { error: updateError } = await supabase.from('duty_assignment_notifications').update({ desk_admin_alert_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', notification.id);
          if (updateError) throw updateError;
        }
        const { error: finishError } = await supabase.from('duty_assignment_notifications').update({ status: 'CANCELLATION_SENT', processing_started_at: null, next_attempt_at: new Date().toISOString(), failure_count: 0, failed_at: null, last_error: null, updated_at: new Date().toISOString() }).eq('id', notification.id).eq('status', 'PROCESSING_CANCELLATION');
        if (finishError) throw finishError;
      }
    } catch (error) { console.error(`Duty notification ${notification.id} failed:`, error); await release(notification, error); }
  }
  return Response.json({ claimed: claimed?.length ?? 0, confirmations, cancellations, deskAlerts, skipped });
});
