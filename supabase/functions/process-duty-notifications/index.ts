import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Notification = {
  id: string;
  profile_id: string;
  slot_id: string;
  duty_date: string;
  status: string;
  created_at: string;
  desk_admin_alert_required: boolean;
  member_cancellation_sent_at: string | null;
  desk_admin_alert_sent_at: string | null;
};

const escapeIcsText = (value: string) => value
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const foldIcsLine = (line: string) => {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = '';
  for (const character of line) {
    if (current && encoder.encode(`${current}${character}`).length > 73) {
      folded.push(current);
      current = ` ${character}`;
    } else current += character;
  }
  folded.push(current);
  return folded.join('\r\n');
};

const toIcsDateTime = (date: string, time: string) => `${date.replaceAll('-', '')}T${time.replaceAll(':', '').slice(0, 4)}00`;

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const buildCalendarInvite = ({ profileId, slotId, dutyDate, startTime, endTime, deskName, deskAddress, createdAt }: {
  profileId: string; slotId: string; dutyDate: string; startTime: string; endTime: string; deskName: string; deskAddress: string; createdAt: string;
}) => {
  const location = `${deskName}, ${deskAddress}`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  const description = `Confirmed JP duty at ${deskName}.\nAddress: ${deskAddress}\nMap: ${mapLink}`;
  // This must be based on the queued notification, not the time of a retry.
  // Resend's idempotency key requires exactly the same request payload if a
  // previous delivery attempt needs to be repeated.
  const stamp = new Date(createdAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AJPA//Service Desk Management Platform//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-TIMEZONE:Pacific/Auckland',
    'BEGIN:VTIMEZONE', 'TZID:Pacific/Auckland', 'X-LIC-LOCATION:Pacific/Auckland',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+1200', 'TZOFFSETTO:+1300', 'TZNAME:NZDT', 'DTSTART:19700927T020000', 'RRULE:FREQ=YEARLY;BYMONTH=9;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+1300', 'TZOFFSETTO:+1200', 'TZNAME:NZST', 'DTSTART:19700405T030000', 'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU', 'END:STANDARD',
    'END:VTIMEZONE', 'BEGIN:VEVENT',
    `UID:ajpa-duty-${profileId}-${slotId}-${dutyDate}@contact.broadbridge.co.nz`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Pacific/Auckland:${toIcsDateTime(dutyDate, startTime)}`, `DTEND;TZID=Pacific/Auckland:${toIcsDateTime(dutyDate, endTime)}`,
    `SUMMARY:${escapeIcsText(`JP duty - ${deskName}`)}`, `LOCATION:${escapeIcsText(location)}`, `DESCRIPTION:${escapeIcsText(description)}`,
    'STATUS:CONFIRMED', 'SEQUENCE:0', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR'
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
};

const displayDate = (date: string) => new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
}).format(new Date(`${date}T12:00:00Z`));

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('REGISTRAR_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(100, Number(body?.limit) || 25));
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: claimed, error: claimError } = await supabase.rpc('claim_due_duty_notifications', { p_limit: limit });
  if (claimError) throw claimError;

  const sendEmail = async (payload: Record<string, unknown>, idempotencyKey: string) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), ...payload }),
    });
    if (!response.ok) throw new Error(`Resend rejected duty notification: ${await response.text()}`);
    return (await response.json().catch(() => ({}))) as { id?: string };
  };

  const loadDetails = async (notification: Notification) => {
    const [memberResult, slotResult] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').eq('id', notification.profile_id).single(),
      supabase.from('duty_slots').select('id, desk_id, start_time, end_time, min_jps').eq('id', notification.slot_id).single(),
    ]);
    if (memberResult.error) throw memberResult.error;
    if (slotResult.error) throw slotResult.error;
    const { data: desk, error: deskError } = await supabase
      .from('service_desks')
      .select('id, code, name, address, primary_admin_id, secondary_admin_id')
      .eq('id', slotResult.data.desk_id)
      .single();
    if (deskError) throw deskError;
    return { member: memberResult.data, slot: slotResult.data, desk };
  };

  const release = async (notification: Notification, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const { error: releaseError } = await supabase.rpc('release_duty_notification', { p_notification_id: notification.id, p_error: message });
    if (releaseError) console.error('Unable to release notification for retry:', releaseError.message);
  };

  let confirmations = 0;
  let cancellations = 0;
  let deskAlerts = 0;
  let skipped = 0;

  for (const notification of (claimed ?? []) as Notification[]) {
    try {
      if (notification.status === 'PROCESSING_CONFIRMATION') {
        const { data: assignment, error: assignmentError } = await supabase
          .from('duty_assignments')
          .select('profile_id')
          .eq('profile_id', notification.profile_id)
          .eq('slot_id', notification.slot_id)
          .eq('duty_date', notification.duty_date)
          .maybeSingle();
        if (assignmentError) throw assignmentError;
        if (!assignment) {
          await supabase.from('duty_assignment_notifications')
            .update({ status: 'CANCELLED_BEFORE_CONFIRMATION', processing_started_at: null, updated_at: new Date().toISOString() })
            .eq('id', notification.id)
            .eq('status', 'PROCESSING_CONFIRMATION');
          skipped += 1;
          continue;
        }

        const { member, slot, desk } = await loadDetails(notification);
        const startTime = slot.start_time.slice(0, 5);
        const endTime = slot.end_time.slice(0, 5);
        const location = `${desk.name}, ${desk.address}`;
        const calendarInvite = buildCalendarInvite({ profileId: member.id, slotId: slot.id, dutyDate: notification.duty_date, startTime, endTime, deskName: desk.name, deskAddress: desk.address, createdAt: notification.created_at });
        const response = await sendEmail({
          to: [member.email],
          subject: `JP duty confirmed — ${desk.name}, ${notification.duty_date}`,
          text: `Hello ${member.full_name || 'JP Member'},\n\nYour JP duty registration has been confirmed.\n\nJP duty - ${desk.name}\nDate: ${notification.duty_date}\nTime: ${startTime} - ${endTime}\nLocation: ${location}\n\nA calendar appointment is attached. Open the .ics file to add it to Google Calendar, Apple Calendar, or Microsoft Outlook. You can still download an appointment from the portal whenever you prefer.\n\nRegards,\nAJPA Roster Team`,
          attachments: [{
            filename: `JP-duty-${notification.duty_date}-${desk.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.ics`,
            content: toBase64(calendarInvite),
            content_type: 'text/calendar; charset=utf-8; method=PUBLISH',
          }],
        }, `duty-confirmation-${notification.id}`);
        const { error: completeError } = await supabase.rpc('complete_duty_confirmation', {
          p_notification_id: notification.id,
          p_resend_confirmation_id: response.id ?? null,
        });
        if (completeError) throw completeError;
        confirmations += 1;
        continue;
      }

      if (notification.status === 'PROCESSING_CANCELLATION') {
        const { member, slot, desk } = await loadDetails(notification);
        const startTime = slot.start_time.slice(0, 5);
        const endTime = slot.end_time.slice(0, 5);

        if (!notification.member_cancellation_sent_at) {
          await sendEmail({
            to: [member.email],
            subject: `JP duty cancelled — ${desk.name}, ${notification.duty_date}`,
            text: `Hello ${member.full_name || 'JP Member'},\n\nYour JP duty registration has been cancelled.\n\nJP duty - ${desk.name}\nDate: ${displayDate(notification.duty_date)}\nTime: ${startTime} - ${endTime}\nLocation: ${desk.name}, ${desk.address}\n\nIf you added this duty to your personal calendar using the email attachment or the portal's Add to Cal option, please delete that appointment yourself. The roster system cannot remove appointments from your personal calendar.\n\nRegards,\nAJPA Roster Team`,
          }, `duty-cancellation-member-${notification.id}`);
          const { error: memberUpdateError } = await supabase.from('duty_assignment_notifications')
            .update({ member_cancellation_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', notification.id);
          if (memberUpdateError) throw memberUpdateError;
          cancellations += 1;
        }

        if (notification.desk_admin_alert_required && !notification.desk_admin_alert_sent_at) {
          const { count: registered, error: countError } = await supabase.from('duty_assignments')
            .select('*', { count: 'exact', head: true })
            .eq('slot_id', notification.slot_id).eq('duty_date', notification.duty_date);
          if (countError) throw countError;
          const adminIds = [...new Set([desk.primary_admin_id, desk.secondary_admin_id].filter(Boolean))];
          const { data: admins, error: adminsError } = adminIds.length
            ? await supabase.from('profiles').select('id, full_name, email').in('id', adminIds).eq('status', 'Approved')
            : { data: [], error: null };
          if (adminsError) throw adminsError;
          const recipients = [...new Map((admins ?? []).filter((admin) => admin.email).map((admin) => [admin.email.toLowerCase(), admin])).values()];
          await Promise.all(recipients.map((admin) => sendEmail({
            to: [admin.email],
            subject: `AJPA action needed: ${desk.name} slot below minimum`,
            text: `Hello ${admin.full_name || 'Desk Admin'},\n\nA JP has withdrawn from a duty within the next seven days, leaving this slot below its minimum staffing requirement.\n\nService desk: [${desk.code || 'JP'}] ${desk.name}\nDate: ${displayDate(notification.duty_date)}\nTime: ${startTime} - ${endTime}\nCurrently registered: ${registered ?? 0}\nMinimum required: ${slot.min_jps}\n\nPlease sign in to the AJPA Service Desk Management Platform to review the roster and arrange cover if required.\n\nRegards,\nAJPA Roster Team`,
          }, `duty-cancellation-desk-${notification.id}-${admin.id}`)));
          const { error: adminUpdateError } = await supabase.from('duty_assignment_notifications')
            .update({ desk_admin_alert_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', notification.id);
          if (adminUpdateError) throw adminUpdateError;
          deskAlerts += recipients.length;
        }

        const { error: finishError } = await supabase.from('duty_assignment_notifications')
          .update({ status: 'CANCELLATION_SENT', processing_started_at: null, last_error: null, updated_at: new Date().toISOString() })
          .eq('id', notification.id)
          .eq('status', 'PROCESSING_CANCELLATION');
        if (finishError) throw finishError;
      }
    } catch (error) {
      console.error(`Duty notification ${notification.id} failed:`, error);
      await release(notification, error);
    }
  }

  return Response.json({ claimed: claimed?.length ?? 0, confirmations, cancellations, deskAlerts, skipped });
});
