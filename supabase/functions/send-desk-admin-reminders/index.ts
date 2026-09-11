import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const aucklandParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: value('hour'), minute: value('minute') };
};

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const daysBetween = (from: string, to: string) => Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
// The input is already an Auckland calendar date. Format it in UTC so adding
// a safe midday timestamp cannot roll the displayed date into the next NZ day.
const displayDate = (date: string) => new Intl.DateTimeFormat('en-NZ', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`));

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('REGISTRAR_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;
  // The database cron job calls hourly so daylight-saving changes cannot shift
  // the intended midnight Pacific/Auckland run. Ignore the other 23 calls.
  const now = aucklandParts();
  if (!force && (now.hour !== '00' || now.minute !== '00')) return Response.json({ ignored: true, reason: 'not-auckland-midnight' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: admins, error: adminsError } = await supabase
    .from('profiles')
    .select('id, full_name, email, desk_admin_reminder_frequency, desk_admin_reminder_start_date, desk_admin_reminder_weeks')
    .eq('status', 'Approved')
    .in('desk_admin_reminder_frequency', ['WEEKLY', 'FORTNIGHTLY']);
  if (adminsError) throw adminsError;

  const dueAdmins = (admins ?? []).filter((admin) => {
    if (!admin.desk_admin_reminder_start_date || !admin.email) return false;
    const elapsedDays = daysBetween(admin.desk_admin_reminder_start_date, now.date);
    const interval = admin.desk_admin_reminder_frequency === 'FORTNIGHTLY' ? 14 : 7;
    return elapsedDays >= 0 && elapsedDays % interval === 0;
  });
  if (!dueAdmins.length) return Response.json({ sent: 0, reason: 'no-reminders-due' });

  const { data: desks, error: desksError } = await supabase
    .from('service_desks')
    .select('id, code, name, primary_admin_id, secondary_admin_id')
    .eq('status', 'Active');
  if (desksError) throw desksError;

  let sent = 0;
  for (const admin of dueAdmins) {
    const managedDesks = (desks ?? []).filter((desk) => desk.primary_admin_id === admin.id || desk.secondary_admin_id === admin.id);
    if (!managedDesks.length) continue;

    const weeks = Math.max(1, Math.min(52, Number(admin.desk_admin_reminder_weeks) || 4));
    const endDate = addDays(now.date, weeks * 7 - 1);
    const deskIds = managedDesks.map((desk) => desk.id);
    const [slotsResult, assignmentsResult, holidaysResult, overridesResult] = await Promise.all([
      supabase.from('duty_slots').select('id, desk_id, day_of_week, start_time, end_time, min_jps, effective_from').in('desk_id', deskIds).eq('status', 'Active'),
      supabase.from('duty_assignments').select('slot_id, duty_date, profile_id').gte('duty_date', now.date).lte('duty_date', endDate),
      supabase.from('statutory_holidays').select('holiday_date').gte('holiday_date', now.date).lte('holiday_date', endDate),
      supabase.from('duty_slot_holiday_overrides').select('duty_slot_id, duty_date, is_holiday').gte('duty_date', now.date).lte('duty_date', endDate)
    ]);
    const failure = [slotsResult, assignmentsResult, holidaysResult, overridesResult].find((result) => result.error);
    if (failure?.error) throw failure.error;

    const assignmentsByOccurrence = new Map<string, number>();
    for (const assignment of assignmentsResult.data ?? []) {
      const key = `${assignment.slot_id}_${assignment.duty_date}`;
      assignmentsByOccurrence.set(key, (assignmentsByOccurrence.get(key) ?? 0) + 1);
    }
    const statutoryHolidayDates = new Set((holidaysResult.data ?? []).map((holiday) => holiday.holiday_date));
    const overrides = new Map((overridesResult.data ?? []).map((override) => [`${override.duty_slot_id}_${override.duty_date}`, override.is_holiday]));
    const deskById = new Map(managedDesks.map((desk) => [desk.id, desk]));
    const shortfalls: Array<{ desk: string; date: string; time: string; registered: number; minimum: number }> = [];

    for (let offset = 0; offset < weeks * 7; offset += 1) {
      const dutyDate = addDays(now.date, offset);
      for (const slot of slotsResult.data ?? []) {
        if (slot.effective_from && slot.effective_from > dutyDate) continue;
        if (slot.day_of_week !== weekday(dutyDate)) continue;
        const occurrenceKey = `${slot.id}_${dutyDate}`;
        const isHoliday = overrides.has(occurrenceKey) ? overrides.get(occurrenceKey) : statutoryHolidayDates.has(dutyDate);
        if (isHoliday) continue;
        const registered = assignmentsByOccurrence.get(occurrenceKey) ?? 0;
        if (registered < slot.min_jps) {
          const desk = deskById.get(slot.desk_id);
          shortfalls.push({
            desk: `[${desk?.code || 'JP'}] ${desk?.name || 'Service Desk'}`,
            date: dutyDate,
            time: `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`,
            registered,
            minimum: slot.min_jps
          });
        }
      }
    }

    const scope = `${displayDate(now.date)} to ${displayDate(endDate)} (${weeks} week${weeks === 1 ? '' : 's'})`;
    const text = shortfalls.length
      ? `Hello ${admin.full_name || 'Desk Admin'},\n\nThis is your AJPA Service Desk roster reminder for ${scope}.\n\nThe following open slots have not yet reached their minimum JP requirement:\n\n${shortfalls.map((shortfall) => `• ${shortfall.desk}\n  ${displayDate(shortfall.date)} · ${shortfall.time}\n  Registered: ${shortfall.registered}; minimum required: ${shortfall.minimum}`).join('\n\n')}\n\nPlease sign in to the AJPA Service Desk Management Platform to review the roster.\n\nRegards,\nAJPA Roster Team`
      : `Hello ${admin.full_name || 'Desk Admin'},\n\nThis is your AJPA Service Desk roster reminder for ${scope}.\n\nGood news: every open slot at your Primary and Secondary desks has reached its minimum JP requirement for this reporting period.\n\nRegards,\nAJPA Roster Team`;
    const subject = shortfalls.length
      ? `AJPA roster reminder: ${shortfalls.length} slot${shortfalls.length === 1 ? '' : 's'} below minimum`
      : 'AJPA roster reminder: all your slots meet minimum staffing';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), to: [admin.email], subject, text })
    });
    if (!response.ok) throw new Error(`Resend rejected reminder email: ${await response.text()}`);
    sent += 1;
  }

  return Response.json({ sent, date: now.date });
});
