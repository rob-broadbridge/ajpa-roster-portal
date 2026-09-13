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
  const now = aucklandParts();
  // New weekly/fortnightly reports are created only at local midnight. The
  // hourly invocations also process any previously failed report that has
  // reached its retry time.
  const canCreateNewReminders = force || (now.hour === '00' && now.minute === '00');

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: admins, error: adminsError } = await supabase
    .from('profiles')
    .select('id, full_name, email, desk_admin_reminder_frequency, desk_admin_reminder_start_date, desk_admin_reminder_weeks')
    .eq('status', 'Approved')
    .in('desk_admin_reminder_frequency', ['WEEKLY', 'FORTNIGHTLY']);
  if (adminsError) throw adminsError;

  const dueAdmins = canCreateNewReminders ? (admins ?? []).filter((admin) => {
    if (!admin.desk_admin_reminder_start_date || !admin.email) return false;
    const elapsedDays = daysBetween(admin.desk_admin_reminder_start_date, now.date);
    const interval = admin.desk_admin_reminder_frequency === 'FORTNIGHTLY' ? 14 : 7;
    return elapsedDays >= 0 && elapsedDays % interval === 0;
  }) : [];

  const { data: desks, error: desksError } = await supabase
    .from('service_desks')
    .select('id, code, name, primary_admin_id, secondary_admin_id')
    .eq('status', 'Active');
  if (desksError) throw desksError;

  const { data: retries, error: retriesError } = await supabase
    .from('desk_admin_reminder_deliveries')
    .select('profile_id, report_start_date, report_end_date, profiles(id, full_name, email)')
    .eq('status', 'PENDING')
    .lte('next_attempt_at', new Date().toISOString());
  if (retriesError) throw retriesError;

  const candidates = [
    ...dueAdmins.map((admin) => {
      const weeks = Math.max(1, Math.min(52, Number(admin.desk_admin_reminder_weeks) || 4));
      return { admin, reportStartDate: now.date, reportEndDate: addDays(now.date, weeks * 7 - 1) };
    }),
    ...(retries ?? []).map((retry) => ({
      admin: Array.isArray(retry.profiles) ? retry.profiles[0] : retry.profiles,
      reportStartDate: retry.report_start_date,
      reportEndDate: retry.report_end_date
    }))
  ];

  let sent = 0;
  let skipped = 0;
  const processed = new Set<string>();
  for (const candidate of candidates) {
    const admin = candidate.admin;
    if (!admin?.id || !admin.email) continue;
    const candidateKey = `${admin.id}_${candidate.reportStartDate}_${candidate.reportEndDate}`;
    if (processed.has(candidateKey)) continue;
    processed.add(candidateKey);
    const managedDesks = (desks ?? []).filter((desk) => desk.primary_admin_id === admin.id || desk.secondary_admin_id === admin.id);
    if (!managedDesks.length) continue;

    const reportStartDate = candidate.reportStartDate;
    const endDate = candidate.reportEndDate;
    const weeks = Math.max(1, Math.ceil((daysBetween(reportStartDate, endDate) + 1) / 7));
    const { data: deliveryId, error: claimError } = await supabase.rpc('claim_desk_admin_reminder_delivery', {
      p_profile_id: admin.id,
      p_timezone: 'Pacific/Auckland',
      p_report_start_date: reportStartDate,
      p_report_end_date: endDate
    });
    if (claimError) throw claimError;
    // The row is unique per Desk Admin and reporting period. It prevents a
    // manual test or an overlapping scheduler call from sending duplicates.
    if (!deliveryId) { skipped += 1; continue; }

    try {
    const deskIds = managedDesks.map((desk) => desk.id);
    const [slotsResult, assignmentsResult, holidaysResult, overridesResult] = await Promise.all([
      supabase.from('duty_slots').select('id, desk_id, day_of_week, start_time, end_time, min_jps, effective_from').in('desk_id', deskIds).eq('status', 'Active'),
      supabase.from('duty_assignments').select('slot_id, duty_date, profile_id').gte('duty_date', reportStartDate).lte('duty_date', endDate),
      supabase.from('statutory_holidays').select('holiday_date').gte('holiday_date', reportStartDate).lte('holiday_date', endDate),
      supabase.from('duty_slot_holiday_overrides').select('duty_slot_id, duty_date, is_holiday').gte('duty_date', reportStartDate).lte('duty_date', endDate)
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
      const dutyDate = addDays(reportStartDate, offset);
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

    const scope = `${displayDate(reportStartDate)} to ${displayDate(endDate)} (${weeks} week${weeks === 1 ? '' : 's'})`;
    const text = shortfalls.length
      ? `Hello ${admin.full_name || 'Desk Admin'},\n\nThis is your AJPA Service Desk roster reminder for ${scope}.\n\nThe following open slots have not yet reached their minimum JP requirement:\n\n${shortfalls.map((shortfall) => `• ${shortfall.desk}\n  ${displayDate(shortfall.date)} · ${shortfall.time}\n  Registered: ${shortfall.registered}; minimum required: ${shortfall.minimum}`).join('\n\n')}\n\nPlease sign in to the AJPA Service Desk Management Platform to review the roster.\n\nRegards,\nAJPA Roster Team`
      : `Hello ${admin.full_name || 'Desk Admin'},\n\nThis is your AJPA Service Desk roster reminder for ${scope}.\n\nGood news: every open slot at your Primary and Secondary desks has reached its minimum JP requirement for this reporting period.\n\nRegards,\nAJPA Roster Team`;
    const subject = shortfalls.length
      ? `AJPA roster reminder: ${shortfalls.length} slot${shortfalls.length === 1 ? '' : 's'} below minimum`
      : 'AJPA roster reminder: all your slots meet minimum staffing';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': `desk-admin-reminder-${deliveryId}` },
      body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), to: [admin.email], subject, text })
    });
    if (!response.ok) throw new Error(`Resend rejected reminder email: ${await response.text()}`);
    const resendResponse = await response.json().catch(() => ({})) as { id?: string };
    const { error: completeError } = await supabase.rpc('complete_desk_admin_reminder_delivery', {
      p_delivery_id: deliveryId,
      p_resend_email_id: resendResponse.id ?? null
    });
    if (completeError) throw completeError;
    sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Desk Admin reminder ${deliveryId} failed:`, error);
      const { error: releaseError } = await supabase.rpc('release_desk_admin_reminder_delivery', {
        p_delivery_id: deliveryId,
        p_error: message
      });
      if (releaseError) console.error('Unable to schedule Desk Admin reminder retry:', releaseError.message);
    }
  }

  return Response.json({ sent, skipped, date: now.date, createdNewReports: canCreateNewReminders });
});
