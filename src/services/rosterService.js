import { supabase } from '../supabaseClient';

export async function fetchRosterData(profileId) {
  const [profilesResult, regionsResult, desksResult, slotsResult, followsResult, assignmentsResult, rulesResult, statisticsResult, preferencesResult, statutoryHolidaysResult, slotHolidayOverridesResult] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('regions').select('*').order('name'),
    supabase.from('service_desks').select('*, regions(name)').order('name'),
    supabase.from('duty_slots').select('*').eq('status', 'Active'),
    supabase.from('desk_follows').select('desk_id').eq('profile_id', profileId),
    supabase.from('duty_assignments').select('slot_id, duty_date, profile_id'),
    supabase.from('recurring_rules').select('*').order('created_at'),
    supabase.from('duty_statistics').select('*').order('duty_date', { ascending: false }),
    supabase.from('user_preferences').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('statutory_holidays').select('*').order('holiday_date'),
    supabase.from('duty_slot_holiday_overrides').select('*')
  ]);

  const failure = [profilesResult, regionsResult, desksResult, slotsResult, followsResult, assignmentsResult, rulesResult, statisticsResult, statutoryHolidaysResult, slotHolidayOverridesResult].find(result => result.error);
  if (failure) throw failure.error;

  const users = profilesResult.data.map(member => ({ id: member.id, fullName: member.full_name, email: member.email, phone: member.phone || '', warrantNumber: member.warrant_number || '', role: member.role, isProvisional: member.is_provisional, status: member.status, reminderFrequency: member.desk_admin_reminder_frequency || 'NONE', reminderStartDate: member.desk_admin_reminder_start_date || '', reminderWeeks: member.desk_admin_reminder_weeks || 4 }));
  const regions = regionsResult.data.map(region => ({ id: region.id, name: region.name, code: region.code }));
  const desks = desksResult.data.map(desk => ({ id: desk.id, code: desk.code, name: desk.name, address: desk.address, region: desk.regions?.name || '', primaryAdminId: desk.primary_admin_id, secondaryAdminId: desk.secondary_admin_id, siteContactName: desk.site_contact_name, siteContactEmail: desk.site_contact_email, contactPerson: desk.contact_person, notes: desk.notes, status: desk.status }));
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
  const rules = rulesResult.data.map(rule => ({ id: rule.id, userId: rule.profile_id, slotId: rule.slot_id, action: rule.action, type: rule.rule_type, startDate: rule.start_date, untilDate: rule.until_date, countN: rule.count_n }));
  const statistics = statisticsResult.data.map(stat => ({ id: stat.id, jpId: stat.profile_id, deskId: stat.slot_id, deskName: stat.desk_name_snapshot, deskCode: stat.desk_code_snapshot, date: stat.duty_date, startTime: stat.start_time_snapshot.slice(0, 5), endTime: stat.end_time_snapshot.slice(0, 5), noOfJpDuties: stat.no_of_jp_duties, noOfClients: stat.no_of_clients, noOfHoursWorked: Number(stat.no_of_hours_worked), certifiedCopies: stat.certified_copies, statutoryDeclarations: stat.statutory_declarations, signatureWitnessed: stat.signatures_witnessed, affidavits: stat.affidavits, other: stat.other_duties, notes: stat.notes }));

  const statutoryHolidays = statutoryHolidaysResult.data.map(holiday => ({ id: holiday.id, date: holiday.holiday_date, description: holiday.description }));
  const slotHolidayOverrides = slotHolidayOverridesResult.data.map(override => ({ slotId: override.duty_slot_id, date: override.duty_date, isHoliday: override.is_holiday }));

  return { users, regions, desks, slots, followedDesks: followsResult.data.map(follow => follow.desk_id), assignments, rules, statistics, statutoryHolidays, slotHolidayOverrides, preferences: preferencesResult.data, preferencesError: preferencesResult.error };
}
