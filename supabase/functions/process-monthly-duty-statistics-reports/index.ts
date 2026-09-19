import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const isMonthEnd = (date: string) => addDays(date, 1).slice(8) === '01';
const displayDate = (date: string) => new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric'
}).format(new Date(`${date}T12:00:00Z`));
const localTime = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts();
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: get('hour') };
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('REGISTRAR_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: deskRows, error: deskError } = await supabase
    .from('service_desks')
    .select('id, code, name, primary_admin_id, secondary_admin_id, is_home_based_service, regions(timezone)')
    .eq('status', 'Active');
  if (deskError) throw deskError;

  const desks = (deskRows ?? []).filter((desk: any) => !desk.is_home_based_service);
  const timezoneFor = (desk: any) => (Array.isArray(desk.regions) ? desk.regions[0] : desk.regions)?.timezone || 'Pacific/Auckland';
  const adminIds = [...new Set(desks.flatMap((desk: any) => [desk.primary_admin_id, desk.secondary_admin_id]).filter(Boolean))];
  if (!adminIds.length) return Response.json({ sent: 0, skipped: 0, candidates: 0 });

  const { data: admins, error: adminError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', adminIds)
    .eq('status', 'Approved');
  if (adminError) throw adminError;
  const adminById = new Map((admins ?? []).filter((admin: any) => admin.email).map((admin: any) => [admin.id, admin]));

  const candidates = new Map<string, any>();
  const addCandidate = (admin: any, timezone: string, reportMonth: string) => {
    const managedDesks = desks.filter((desk: any) => timezoneFor(desk) === timezone && (desk.primary_admin_id === admin.id || desk.secondary_admin_id === admin.id));
    if (!managedDesks.length) return;
    const key = `${admin.id}|${timezone}|${reportMonth}`;
    const candidate = candidates.get(key) ?? { admin, timezone, reportMonth, desks: [] };
    candidate.desks = managedDesks;
    candidates.set(key, candidate);
  };
  for (const desk of desks) {
    const timezone = timezoneFor(desk);
    const now = localTime(timezone);
    // The database job runs each minute. Allow the whole 22:00 hour so a
    // transient email failure can be retried before the local day ends.
    if (now.hour !== '22' || !isMonthEnd(now.date)) continue;
    for (const adminId of [desk.primary_admin_id, desk.secondary_admin_id]) {
      const admin = adminId ? adminById.get(adminId) : null;
      if (!admin) continue;
      addCandidate(admin, timezone, monthStart(now.date));
    }
  }

  // Retries must not be limited to the local 10 pm month-end window. A report
  // that cannot be sent at 10 pm is picked up by later scheduler runs until
  // delivery succeeds or the normal five-attempt limit is reached.
  const retryCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: pendingReports, error: pendingReportsError } = await supabase
    .from('desk_admin_monthly_statistics_reports')
    .select('profile_id, timezone, report_month, status, next_attempt_at, processing_started_at')
    .in('status', ['PENDING', 'PROCESSING']);
  if (pendingReportsError) throw pendingReportsError;
  for (const report of pendingReports ?? []) {
    const readyToRetry = (report.status === 'PENDING' && report.next_attempt_at <= new Date().toISOString())
      || (report.status === 'PROCESSING' && report.processing_started_at && report.processing_started_at < retryCutoff);
    if (!readyToRetry) continue;
    const admin = adminById.get(report.profile_id);
    if (admin) addCandidate(admin, report.timezone, report.report_month);
  }

  let sent = 0;
  let skipped = 0;
  for (const candidate of candidates.values()) {
    const { data: reportId, error: claimError } = await supabase.rpc('claim_desk_admin_monthly_statistics_report', {
      p_profile_id: candidate.admin.id, p_timezone: candidate.timezone, p_report_month: candidate.reportMonth
    });
    if (claimError) throw claimError;
    if (!reportId) { skipped += 1; continue; }

    try {
      const nextMonth = addDays(candidate.reportMonth, 32).slice(0, 7) + '-01';
      const reportEnd = addDays(nextMonth, -1);
      const deskIds = candidate.desks.map((desk: any) => desk.id);
      const [slotsResult, assignmentsResult, statsResult, holidaysResult, overridesResult] = await Promise.all([
        supabase.from('duty_slots').select('id, desk_id, day_of_week, start_time, end_time, effective_from').in('desk_id', deskIds).eq('status', 'Active'),
        supabase.from('duty_assignments').select('slot_id, duty_date, profile_id, profiles(full_name, warrant_number)').gte('duty_date', candidate.reportMonth).lte('duty_date', reportEnd),
        supabase.from('duty_statistics').select('slot_id, duty_date, profile_id').gte('duty_date', candidate.reportMonth).lte('duty_date', reportEnd),
        supabase.from('statutory_holidays').select('holiday_date').gte('holiday_date', candidate.reportMonth).lte('holiday_date', reportEnd),
        supabase.from('duty_slot_holiday_overrides').select('duty_slot_id, duty_date, is_holiday').gte('duty_date', candidate.reportMonth).lte('duty_date', reportEnd)
      ]);
      const failed = [slotsResult, assignmentsResult, statsResult, holidaysResult, overridesResult].find((result) => result.error);
      if (failed?.error) throw failed.error;

      const statistics = new Set((statsResult.data ?? []).map((stat: any) => `${stat.slot_id}|${stat.duty_date}|${stat.profile_id}`));
      const holidays = new Set((holidaysResult.data ?? []).map((holiday: any) => holiday.holiday_date));
      const overrides = new Map((overridesResult.data ?? []).map((row: any) => [`${row.duty_slot_id}|${row.duty_date}`, row.is_holiday]));
      const slots = new Map((slotsResult.data ?? []).map((slot: any) => [slot.id, slot]));
      const desksById = new Map(candidate.desks.map((desk: any) => [desk.id, desk]));
      const outstanding: any[] = [];

      for (const assignment of assignmentsResult.data ?? []) {
        const slot = slots.get(assignment.slot_id);
        if (!slot || slot.day_of_week !== weekday(assignment.duty_date) || (slot.effective_from && slot.effective_from > assignment.duty_date)) continue;
        const occurrenceKey = `${slot.id}|${assignment.duty_date}`;
        const closed = overrides.has(occurrenceKey) ? overrides.get(occurrenceKey) : holidays.has(assignment.duty_date);
        if (closed || statistics.has(`${assignment.slot_id}|${assignment.duty_date}|${assignment.profile_id}`)) continue;
        const desk = desksById.get(slot.desk_id);
        const profile = Array.isArray(assignment.profiles) ? assignment.profiles[0] : assignment.profiles;
        outstanding.push({
          desk: `[${desk?.code || 'JP'}] ${desk?.name || 'Service Desk'}`,
          date: assignment.duty_date,
          time: `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`,
          member: `${profile?.full_name || 'JP Member'}${profile?.warrant_number ? ` (${profile.warrant_number})` : ''}`
        });
      }
      outstanding.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.desk.localeCompare(b.desk) || a.member.localeCompare(b.member));
      const monthLabel = new Intl.DateTimeFormat('en-NZ', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${candidate.reportMonth}T12:00:00Z`));
      const text = outstanding.length
        ? `Hello ${candidate.admin.full_name || 'Desk Admin'},\n\nThe following completed rostered duties in ${monthLabel} have a registered JP but no Statistics entered. Closed days, including holidays and individual slot closures, are excluded.\n\n${outstanding.map((row) => `• ${row.desk}\n  ${displayDate(row.date)} · ${row.time}\n  JP: ${row.member}`).join('\n\n')}\n\nPlease sign in to the AJPA Service Desk Management Platform to review or maintain these Statistics.\n\nRegards,\nAJPA Roster Team`
        : `Hello ${candidate.admin.full_name || 'Desk Admin'},\n\nAll registered rostered duties for ${monthLabel} at your assigned Service Desks have Statistics recorded. Closed days, including holidays and individual slot closures, are excluded.\n\nRegards,\nAJPA Roster Team`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': `desk-admin-monthly-statistics-${reportId}` },
        body: JSON.stringify({
          from: Deno.env.get('RESEND_FROM_EMAIL'), to: [candidate.admin.email],
          subject: outstanding.length ? `AJPA monthly Statistics report: ${outstanding.length} outstanding` : `AJPA monthly Statistics report: complete for ${monthLabel}`,
          text
        })
      });
      if (!response.ok) throw new Error(`Resend rejected monthly Statistics report: ${await response.text()}`);
      const body = await response.json().catch(() => ({})) as { id?: string };
      const { error: completeError } = await supabase.rpc('complete_desk_admin_monthly_statistics_report', { p_report_id: reportId, p_resend_email_id: body.id ?? null });
      if (completeError) throw completeError;
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Monthly Statistics report ${reportId} failed:`, error);
      await supabase.rpc('release_desk_admin_monthly_statistics_report', { p_report_id: reportId, p_error: message });
    }
  }
  return Response.json({ sent, skipped, candidates: candidates.size });
});
