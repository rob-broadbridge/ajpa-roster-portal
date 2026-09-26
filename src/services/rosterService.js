import { supabase } from '../supabaseClient';

export async function getMemberLifecyclePreview(memberId) {
  const { data, error } = await supabase.rpc('get_member_lifecycle_preview', { p_member_id: memberId });
  if (error) throw error;
  return data;
}

export async function applyMemberLifecycleTransition({ memberId, action, newRole = null, expectedStatus = null, expectedRole = null }) {
  const { data, error } = await supabase.rpc('apply_member_lifecycle_transition', {
    p_member_id: memberId,
    p_action: action,
    p_new_role: newRole,
    p_expected_status: expectedStatus,
    p_expected_role: expectedRole
  });
  if (error) throw error;
  return data;
}

export async function updateMemberProfileAndRole({ memberId, fullName, phone, warrantNumber, isProvisional, newRole, expectedStatus, expectedRole }) {
  const { data, error } = await supabase.rpc('update_member_profile_and_role', {
    p_member_id: memberId, p_full_name: fullName, p_phone: phone, p_warrant_number: warrantNumber,
    p_is_provisional: isProvisional, p_new_role: newRole, p_expected_status: expectedStatus, p_expected_role: expectedRole
  });
  if (error) throw error;
  return data;
}

export async function fetchRosterActivityAudit({ limit = 250, fromDate = null, toDate = null } = {}) {
  const { data, error } = await supabase.rpc('get_roster_activity_audit_for_current_user', {
    p_limit: limit,
    p_from_date: fromDate || null,
    p_to_date: toDate || null
  });

  if (error) throw error;

  return (data ?? []).map(activity => ({
    id: activity.id,
    occurredAt: activity.occurred_at,
    actorProfileId: activity.actor_profile_id,
    subjectProfileId: activity.subject_profile_id,
    eventType: activity.event_type,
    previousStatus: activity.previous_status,
    newStatus: activity.new_status,
    previousRole: activity.previous_role,
    newRole: activity.new_role,
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

// This database function returns only statistics that the signed-in Registrar
// or assigned Desk Admin is permitted to maintain. Keeping the historical
// query in the database avoids loading the full assignment history into the
// browser merely to find incomplete records.
export async function fetchIncompleteDutyStatistics() {
  const { data, error } = await supabase.rpc('get_incomplete_duty_statistics_for_current_user');
  if (error) throw error;

  return (data ?? []).map(item => ({
    memberId: item.member_id,
    memberName: item.member_name,
    warrantNumber: item.warrant_number || '',
    slotId: item.slot_id,
    dutyDate: item.duty_date,
    deskId: item.desk_id,
    deskName: item.desk_name,
    deskCode: item.desk_code,
    startTime: item.start_time?.slice(0, 5) || '',
    endTime: item.end_time?.slice(0, 5) || ''
  }));
}

// Contact details are intentionally retrieved only from this database function.
// It independently limits a Desk Admin to followers of their assigned desks.
export async function fetchDeskFollowerContacts(deskId = null) {
  const { data, error } = await supabase.rpc('get_desk_follower_contacts_for_current_user', {
    p_desk_id: deskId || null
  });
  if (error) throw error;

  return (data ?? []).map(member => ({
    id: member.profile_id,
    fullName: member.full_name,
    warrantNumber: member.warrant_number || '',
    email: member.email || '',
    phone: member.phone || ''
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
  const statisticsReminders = data?.statistics_reminders || {};
  const monthlyStatisticsReports = data?.monthly_statistics_reports || {};
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
    statisticsReminders: {
      failed: Number(statisticsReminders.failed) || 0,
      waiting: Number(statisticsReminders.waiting) || 0
    },
    monthlyStatisticsReports: {
      failed: Number(monthlyStatisticsReports.failed) || 0,
      waiting: Number(monthlyStatisticsReports.waiting) || 0
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

const mapStatistics = (records, users, desks, slots) => {
  const userMap = Object.fromEntries(users.map(user => [user.id, user]));
  const deskMap = Object.fromEntries(desks.map(desk => [desk.id, desk]));
  const slotMap = Object.fromEntries(slots.map(slot => [slot.id, slot]));

  return (records ?? []).map(stat => {
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
      isHomeBasedService: Boolean(desk?.isHomeBasedService || stat.desk_name_snapshot === 'Home Based Service'),
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
};

export async function fetchStatisticsForWindow({ startDate, endDate, users, desks, slots }) {
  const statisticsQuery = supabase.from('duty_statistics').select('*').order('duty_date', { ascending: false });
  if (startDate) statisticsQuery.gte('duty_date', startDate);
  if (endDate) statisticsQuery.lte('duty_date', endDate);

  const { data, error } = await statisticsQuery;
  if (error) throw error;

  return mapStatistics(data, users, desks, slots);
}

export async function fetchRosterData(profileId, { operationalStartDate, operationalEndDate, statisticsStartDate, statisticsEndDate } = {}) {
  const assignmentsQuery = supabase.from('duty_assignments').select('slot_id, duty_date, profile_id');
  const slotHolidayOverridesQuery = supabase.from('duty_slot_holiday_overrides').select('*');
  const statisticsQuery = supabase.from('duty_statistics').select('*').order('duty_date', { ascending: false });

  if (operationalStartDate) {
    assignmentsQuery.gte('duty_date', operationalStartDate);
    slotHolidayOverridesQuery.gte('duty_date', operationalStartDate);
  }
  if (operationalEndDate) {
    assignmentsQuery.lte('duty_date', operationalEndDate);
    slotHolidayOverridesQuery.lte('duty_date', operationalEndDate);
  }
  if (statisticsStartDate) statisticsQuery.gte('duty_date', statisticsStartDate);
  if (statisticsEndDate) statisticsQuery.lte('duty_date', statisticsEndDate);

  const [profilesResult, regionsResult, desksResult, slotsResult, followsResult, assignmentsResult, statisticsResult, preferencesResult, statutoryHolidaysResult, slotHolidayOverridesResult] = await Promise.all([
    supabase.rpc('get_roster_member_directory_for_current_user'),
    supabase.from('regions').select('*').order('name'),
    supabase.from('service_desks').select('*, regions(name, timezone)').order('name'),
    supabase.from('duty_slots').select('*').eq('status', 'Active'),
    supabase.from('desk_follows').select('desk_id').eq('profile_id', profileId),
    assignmentsQuery,
    statisticsQuery,
    supabase.from('user_preferences').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('statutory_holidays').select('*').order('holiday_date'),
    slotHolidayOverridesQuery
  ]);

  const failure = [profilesResult, regionsResult, desksResult, slotsResult, followsResult, assignmentsResult, statisticsResult, statutoryHolidaysResult, slotHolidayOverridesResult].find(result => result.error);
  if (failure) throw failure.error;

  const users = profilesResult.data.map(member => ({
    id: member.id,
    fullName: member.full_name,
    email: member.email || '',
    phone: member.phone || '',
    warrantNumber: member.warrant_number || '',
    role: member.role || '',
    isProvisional: Boolean(member.is_provisional),
    status: member.status || (member.is_approved ? 'Approved' : ''),
    isApproved: Boolean(member.is_approved),
    canBeDeskAdmin: Boolean(member.can_be_desk_admin),
    reminderFrequency: member.reminder_frequency || 'NONE',
    reminderStartDate: member.reminder_start_date || '',
    reminderWeeks: member.reminder_weeks || 4
  }));
  const regions = regionsResult.data.map(region => ({ id: region.id, name: region.name, code: region.code, timezone: region.timezone || 'Pacific/Auckland' }));
  const desks = desksResult.data.map(desk => ({ id: desk.id, code: desk.code, name: desk.name, address: desk.address, region: desk.regions?.name || '', timeZone: desk.regions?.timezone || 'Pacific/Auckland', primaryAdminId: desk.primary_admin_id, secondaryAdminId: desk.secondary_admin_id, siteContactName: desk.site_contact_name, siteContactEmail: desk.site_contact_email, contactPerson: desk.contact_person, notes: desk.notes, status: desk.status, isHomeBasedService: Boolean(desk.is_home_based_service) }));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const slots = slotsResult.data.map(slot => ({ id: slot.id, deskId: slot.desk_id, dayOfWeek: dayNames[slot.day_of_week], startTime: slot.start_time.slice(0, 5), endTime: slot.end_time.slice(0, 5), minJps: slot.min_jps, targetJps: slot.target_jps, maxJps: slot.max_jps, status: slot.status, effectiveFromDate: slot.effective_from }));
  const slotMap = Object.fromEntries(slots.map(slot => [slot.id, slot]));
  const assignments = assignmentsResult.data.reduce((all, assignment) => {
    const slot = slotMap[assignment.slot_id];
    if (!slot) return all;
    const key = `${slot.deskId}_${slot.id}_${assignment.duty_date}`;
    all[key] = [...(all[key] || []), assignment.profile_id];
    return all;
  }, {});
  const statistics = mapStatistics(statisticsResult.data, users, desks, slots);

  const statutoryHolidays = statutoryHolidaysResult.data.map(holiday => ({ id: holiday.id, date: holiday.holiday_date, description: holiday.description }));
  const slotHolidayOverrides = slotHolidayOverridesResult.data.map(override => ({ slotId: override.duty_slot_id, date: override.duty_date, isHoliday: override.is_holiday }));

  return { users, regions, desks, slots, followedDesks: followsResult.data.map(follow => follow.desk_id), assignments, statistics, statutoryHolidays, slotHolidayOverrides, preferences: preferencesResult.data, preferencesError: preferencesResult.error };
}
