import { supabase } from '../supabaseClient';

export async function fetchRosterActivityAudit(limit = 250) {
  const { data, error } = await supabase
    .from('roster_activity_audit')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map(activity => ({
    id: activity.id,
    occurredAt: activity.occurred_at,
    actorProfileId: activity.actor_profile_id,
    subjectProfileId: activity.subject_profile_id,
    eventType: activity.event_type,
    dutySlotId: activity.duty_slot_id,
    dutyDate: activity.duty_date,
    ruleAction: activity.rule_action,
    ruleType: activity.rule_type,
    ruleStartDate: activity.rule_start_date,
    ruleUntilDate: activity.rule_until_date,
    ruleCount: activity.rule_count_n,
    deskCode: activity.desk_code_snapshot,
    deskName: activity.desk_name_snapshot,
    startTime: activity.start_time_snapshot?.slice(0, 5) || '',
    endTime: activity.end_time_snapshot?.slice(0, 5) || ''
  }));
}

// This RPC deliberately exposes only permanently failed email jobs, and the
// database function independently checks that the caller is a Registrar.
// Keeping the query in the service layer prevents the UI from ever reading the
// notification outbox directly.
export async function fetchDutyNotificationFailures(limit = 100) {
  const { data, error } = await supabase.rpc('get_duty_notification_failures', {
    p_limit: limit
  });

  if (error) throw error;

  return (data ?? []).map(notification => ({
    id: notification.id,
    status: notification.status,
    failureCount: notification.failure_count,
    lastError: notification.last_error || '',
    dutyDate: notification.duty_date,
    updatedAt: notification.updated_at,
    memberName: notification.member_name || 'Unavailable member',
    deskName: notification.desk_name || 'Unavailable service desk'
  }));
}

// The database function returns only operational summary information. It is
// independently restricted to Registrars, so this never exposes notification
// contents, email addresses, or delivery payloads to the browser.
export async function fetchRosterOperationalHealth() {
  const { data, error } = await supabase.rpc('get_roster_operational_health');

  if (error) throw error;

  const dutyNotifications = data?.duty_notifications || {};
  const deskAdminReminders = data?.desk_admin_reminders || {};
  const schedules = data?.schedules || {};

  return {
    dutyNotifications: {
      failed: Number(dutyNotifications.failed) || 0,
      waiting: Number(dutyNotifications.waiting) || 0
    },
    deskAdminReminders: {
      failed: Number(deskAdminReminders.failed) || 0,
      waiting: Number(deskAdminReminders.waiting) || 0
    },
    schedules: Object.entries(schedules).map(([jobName, job]) => ({
      jobName,
      schedule: job?.schedule || '',
      active: Boolean(job?.active),
      lastStatus: job?.last_status || '',
      lastStartedAt: job?.last_started_at || null,
      lastFinishedAt: job?.last_finished_at || null,
      lastMessage: job?.last_message || ''
    })),
    checkedAt: data?.checked_at || null
  };
}

export async function retryDutyNotificationFailure(notificationId) {
  const { data, error } = await supabase.rpc('retry_failed_duty_notification', {
    p_notification_id: notificationId
  });

  if (error) throw error;
  return data;
}

// Full roster history is only required when a Registrar explicitly requests a
// CSV archive. Normal portal use needs the operational calendar window only.
export async function fetchFullRosterArchiveData() {
  const [assignmentsResult, slotHolidayOverridesResult] = await Promise.all([
    supabase.from('duty_assignments').select('slot_id, duty_date, profile_id'),
    supabase.from('duty_slot_holiday_overrides').select('*')
  ]);

  const failure = [assignmentsResult, slotHolidayOverridesResult].find(result => result.error);
  if (failure) throw failure.error;

  return {
    assignments: assignmentsResult.data ?? [],
    slotHolidayOverrides: slotHolidayOverridesResult.data ?? []
  };
}

export async function fetchRosterData(profileId, { operationalStartDate, operationalEndDate } = {}) {
  const assignmentsQuery = supabase.from('duty_assignments').select('slot_id, duty_date, profile_id');
  const slotHolidayOverridesQuery = supabase.from('duty_slot_holiday_overrides').select('*');

  if (operationalStartDate) {
    assignmentsQuery.gte('duty_date', operationalStartDate);
    slotHolidayOverridesQuery.gte('duty_date', operationalStartDate);
  }
  if (operationalEndDate) {
    assignmentsQuery.lte('duty_date', operationalEndDate);
    slotHolidayOverridesQuery.lte('duty_date', operationalEndDate);
  }

  const [profilesResult, regionsResult, desksResult, slotsResult, followsResult, assignmentsResult, statisticsResult, preferencesResult, statutoryHolidaysResult, slotHolidayOverridesResult] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('regions').select('*').order('name'),
    supabase.from('service_desks').select('*, regions(name, timezone)').order('name'),
    supabase.from('duty_slots').select('*').eq('status', 'Active'),
    supabase.from('desk_follows').select('desk_id').eq('profile_id', profileId),
    assignmentsQuery,
    supabase.from('duty_statistics').select('*').order('duty_date', { ascending: false }),
    supabase.from('user_preferences').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('statutory_holidays').select('*').order('holiday_date'),
    slotHolidayOverridesQuery
  ]);

  const failure = [profilesResult, regionsResult, desksResult, slotsResult, followsResult, assignmentsResult, statisticsResult, statutoryHolidaysResult, slotHolidayOverridesResult].find(result => result.error);
  if (failure) throw failure.error;

  const users = profilesResult.data.map(member => ({ id: member.id, fullName: member.full_name, email: member.email, phone: member.phone || '', warrantNumber: member.warrant_number || '', role: member.role, isProvisional: member.is_provisional, status: member.status, reminderFrequency: member.desk_admin_reminder_frequency || 'NONE', reminderStartDate: member.desk_admin_reminder_start_date || '', reminderWeeks: member.desk_admin_reminder_weeks || 4 }));
  const regions = regionsResult.data.map(region => ({ id: region.id, name: region.name, code: region.code, timezone: region.timezone || 'Pacific/Auckland' }));
  const desks = desksResult.data.map(desk => ({ id: desk.id, code: desk.code, name: desk.name, address: desk.address, region: desk.regions?.name || '', timeZone: desk.regions?.timezone || 'Pacific/Auckland', primaryAdminId: desk.primary_admin_id, secondaryAdminId: desk.secondary_admin_id, siteContactName: desk.site_contact_name, siteContactEmail: desk.site_contact_email, contactPerson: desk.contact_person, notes: desk.notes, status: desk.status }));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const slots = slotsResult.data.map(slot => ({ id: slot.id, deskId: slot.desk_id, dayOfWeek: dayNames[slot.day_of_week], startTime: slot.start_time.slice(0, 5), endTime: slot.end_time.slice(0, 5), minJps: slot.min_jps, targetJps: slot.target_jps, maxJps: slot.max_jps, status: slot.status, effectiveFromDate: slot.effective_from }));
  const userMap = Object.fromEntries(users.map(user => [user.id, user]));
  const deskMap = Object.fromEntries(desks.map(desk => [desk.id, desk]));
  const slotMap = Object.fromEntries(slots.map(slot => [slot.id, slot]));
  const assignments = assignmentsResult.data.reduce((all, assignment) => {
    const slot = slotMap[assignment.slot_id];
    if (!slot) return all;
    const key = `${slot.deskId}_${slot.id}_${assignment.duty_date}`;
    all[key] = [...(all[key] || []), assignment.profile_id];
    return all;
  }, {});
  const statistics = statisticsResult.data.map(stat => {
    // duty_statistics stores the profile ID, rather than duplicating personal
    // details in every log entry. Resolve it here so the on-screen log and CSV
    // export consistently show the JP's current name and warrant number.
    const member = userMap[stat.profile_id];
    const slot = slotMap[stat.slot_id];
    const desk = slot ? deskMap[slot.deskId] : null;

    return {
      id: stat.id,
      jpId: stat.profile_id,
      jpName: member?.fullName || 'JP member unavailable',
      warrantNumber: member?.warrantNumber || '',
      deskId: slot?.deskId || '',
      deskName: stat.desk_name_snapshot || desk?.name || 'Service Desk',
      deskCode: stat.desk_code_snapshot || desk?.code || '',
      region: desk?.region || '',
      slotId: stat.slot_id,
      occurrenceKey: slot ? `${slot.deskId}_${slot.id}_${stat.duty_date}` : '',
      date: stat.duty_date,
      startTime: stat.start_time_snapshot?.slice(0, 5) || '',
      endTime: stat.end_time_snapshot?.slice(0, 5) || '',
      noOfJpDuties: stat.no_of_jp_duties,
      noOfClients: stat.no_of_clients,
      noOfHoursWorked: Number(stat.no_of_hours_worked),
      certifiedCopies: stat.certified_copies,
      statutoryDeclarations: stat.statutory_declarations,
      signatureWitnessed: stat.signatures_witnessed,
      affidavits: stat.affidavits,
      other: stat.other_duties,
      notes: stat.notes
    };
  });

  const statutoryHolidays = statutoryHolidaysResult.data.map(holiday => ({ id: holiday.id, date: holiday.holiday_date, description: holiday.description }));
  const slotHolidayOverrides = slotHolidayOverridesResult.data.map(override => ({ slotId: override.duty_slot_id, date: override.duty_date, isHoliday: override.is_holiday }));

  return { users, regions, desks, slots, followedDesks: followsResult.data.map(follow => follow.desk_id), assignments, statistics, statutoryHolidays, slotHolidayOverrides, preferences: preferencesResult.data, preferencesError: preferencesResult.error };
}
