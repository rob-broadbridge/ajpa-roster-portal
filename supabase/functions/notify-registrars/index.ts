import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const escapeIcsText = (value: string) => value
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

// Apple Calendar can reject long, unfolded iCalendar content lines even when
// Google Calendar and Outlook accept them. Fold at a conservative byte limit
// using the RFC continuation-line convention.
const foldIcsLine = (line: string) => {
  const encoder = new TextEncoder();
  const foldedLines: string[] = [];
  let currentLine = '';

  for (const character of line) {
    if (currentLine && encoder.encode(`${currentLine}${character}`).length > 73) {
      foldedLines.push(currentLine);
      currentLine = ` ${character}`;
    } else {
      currentLine += character;
    }
  }

  foldedLines.push(currentLine);
  return foldedLines.join('\r\n');
};

const toIcsDateTime = (date: string, time: string) => `${date.replaceAll('-', '')}T${time.replaceAll(':', '').slice(0, 4)}00`;

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const buildCalendarInvite = ({ profileId, slotId, dutyDate, startTime, endTime, deskName, deskAddress }: {
  profileId: string;
  slotId: string;
  dutyDate: string;
  startTime: string;
  endTime: string;
  deskName: string;
  deskAddress: string;
}) => {
  const location = `${deskName}, ${deskAddress}`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  const description = `Confirmed JP duty at ${deskName}.\nAddress: ${deskAddress}\nMap: ${mapLink}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AJPA//Service Desk Management Platform//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:Pacific/Auckland',
    'BEGIN:VTIMEZONE',
    'TZID:Pacific/Auckland',
    'X-LIC-LOCATION:Pacific/Auckland',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+1200',
    'TZOFFSETTO:+1300',
    'TZNAME:NZDT',
    'DTSTART:19700927T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=9;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+1300',
    'TZOFFSETTO:+1200',
    'TZNAME:NZST',
    'DTSTART:19700405T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:ajpa-duty-${profileId}-${slotId}-${dutyDate}@contact.broadbridge.co.nz`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Pacific/Auckland:${toIcsDateTime(dutyDate, startTime)}`,
    `DTEND;TZID=Pacific/Auckland:${toIcsDateTime(dutyDate, endTime)}`,
    `SUMMARY:${escapeIcsText(`JP duty - ${deskName}`)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('REGISTRAR_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });

  const { type, record: profile, old_record: previousProfile } = await request.json();
  if (!profile) return Response.json({ ignored: true });

  const sendEmail = async (recipient: string, subject: string, text: string) => {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), to: [recipient], subject, text }),
    });
    if (!emailResponse.ok) throw new Error(`Resend rejected the email: ${await emailResponse.text()}`);
  };

  if (type === 'INSERT' && profile && previousProfile === null && profile.slot_id && profile.profile_id && profile.duty_date) {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: member, error: memberError } = await supabase.from('profiles').select('id, full_name, email').eq('id', profile.profile_id).single();
    if (memberError) throw memberError;
    const { data: slot, error: slotError } = await supabase.from('duty_slots').select('id, desk_id, start_time, end_time').eq('id', profile.slot_id).single();
    if (slotError) throw slotError;
    const { data: desk, error: deskError } = await supabase.from('service_desks').select('name, address').eq('id', slot.desk_id).single();
    if (deskError) throw deskError;

    const startTime = slot.start_time.slice(0, 5);
    const endTime = slot.end_time.slice(0, 5);
    const calendarInvite = buildCalendarInvite({
      profileId: member.id,
      slotId: slot.id,
      dutyDate: profile.duty_date,
      startTime,
      endTime,
      deskName: desk.name,
      deskAddress: desk.address,
    });
    const location = `${desk.name}, ${desk.address}`;
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_EMAIL'),
        to: [member.email],
        subject: `JP duty confirmed — ${desk.name}, ${profile.duty_date}`,
        text: `Hello ${member.full_name || 'JP Member'},\n\nYour JP duty registration has been confirmed.\n\nJP duty - ${desk.name}\nDate: ${profile.duty_date}\nTime: ${startTime} - ${endTime}\nLocation: ${location}\n\nA calendar appointment is attached. Open the .ics file to add it to Google Calendar, Apple Calendar, or Microsoft Outlook. You can still download an appointment from the portal whenever you prefer.\n\nRegards,\nAJPA Roster Team`,
        attachments: [{
          filename: `JP-duty-${profile.duty_date}-${desk.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.ics`,
          content: toBase64(calendarInvite),
          content_type: 'text/calendar; charset=utf-8; method=PUBLISH',
        }],
      }),
    });
    if (!emailResponse.ok) throw new Error(`Resend rejected the calendar invitation: ${await emailResponse.text()}`);
    return Response.json({ sent: 1, notification: 'calendar-invite' });
  }

  if (type === 'UPDATE' && previousProfile?.status === 'Pending' && profile.status === 'Approved') {
    const memberHelp = `JP Member Help\n\n1. Account sign-up and login\nYour account is now approved. Sign in with your registered email address and password. If you forget your password, use the Forgot password? link on the sign-in screen.\n\n2. Calendar and filters\nThe Calendar shows a rolling 12-week roster. Use the Region, Desk, Shift Time and Days filters to focus on the shifts relevant to you.\n\n3. Follow service desks\nOpen Service Desks, find a desk you would like to support, and select + Follow. Your calendar can then be limited to your followed desks.\n\n4. Register for and withdraw from shifts\nUse Register on an open slot to register for one shift, the next number of shifts, until a chosen date, or all future shifts. Use Withdraw if your availability changes. Grey slots marked Desk closed or Statutory holiday are not available for registration.\n\n5. My Shifts, calendar files and statistics\nUse My Shifts to review your roster. For a registered shift, Add to Cal downloads a calendar file and Log Stats lets you record the duty statistics after the shift.\n\nThe site has an online Help function with these guidelines and further step-by-step instructions.`;
    const text = `Hello ${profile.full_name || 'JP Member'},\n\nYour access to the AJPA Service Desk Management Platform has been approved. You are now invited to log in and start using the site.\n\nThe site has an online Help function. You can also read the JP Member guidelines below.\n\n${memberHelp}\n\nRegards,\nAJPA Roster Team`;
    await sendEmail(profile.email, 'AJPA Service Desk Management Platform — access approved', text);
    return Response.json({ sent: 1, notification: 'member-approved' });
  }

  if (type !== 'INSERT' || profile.status !== 'Pending') return Response.json({ ignored: true });

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: registrars, error } = await supabase.from('profiles').select('email').eq('role', 'Registrar').eq('status', 'Approved');
  if (error) throw error;
  const recipients = (registrars ?? []).map((registrar) => registrar.email).filter(Boolean);
  if (!recipients.length) return Response.json({ sent: 0 });

  const text = `A new JP sign-up is awaiting review in the AJPA Roster Portal.\n\nName: ${profile.full_name || 'Not supplied'}\nEmail: ${profile.email || 'Not supplied'}\nWarrant number: ${profile.warrant_number || 'Not supplied'}\nPhone: ${profile.phone || 'Not supplied'}\n\nSign in as a Registrar and open Registrar Governance Portal > JP Members to review it.`;
  await Promise.all(recipients.map((recipient) => sendEmail(recipient, `AJPA Roster Portal: new JP sign-up — ${profile.full_name || profile.email}`, text)));
  return Response.json({ sent: recipients.length });
});
