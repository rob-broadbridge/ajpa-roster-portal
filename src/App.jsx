import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { supabase } from './supabaseClient';
import { requestPasswordReset, signInPortalUser, signOutUser, updatePassword } from './services/authService';
import { applyMemberLifecycleTransition, fetchDeskFollowerContacts, fetchDutyNotificationFailures, fetchFullRosterArchiveData, fetchIncompleteDutyStatistics, fetchRosterActivityAudit, fetchRosterData, fetchRosterOperationalHealth, fetchStatisticsForWindow, getMemberLifecyclePreview, retryDutyNotificationFailure, updateMemberProfileAndRole } from './services/rosterService';
import { saveUserPreferences } from './services/preferencesService';
import { DEFAULT_DAY_FILTER, DEFAULT_TIME_OF_DAY_FILTER } from './config/calendar';
import { INITIAL_ASSIGNMENTS, INITIAL_FOLLOWED_DESKS, INITIAL_LOGGED_STATISTICS, INITIAL_REGIONS, INITIAL_SERVICE_DESKS, INITIAL_SLOT_TEMPLATES, INITIAL_USERS } from './config/demoRosterData';
import { IANA_TIME_ZONES } from './config/timezones';
import { addDaysToIsoDate, calendarDateFromIso, calendarDateToIso, DEFAULT_ROSTER_TIME_ZONE, getNextMondayMidnight, getTimeZoneDateString, getWeekStartMonday } from './utils/calendarDates';
import { buildCalendarFile, calculateJpDuties, compareRecurringSlots, getOperationalRosterWindow, hasShiftEnded } from './utils/rosterPresentation';
import { statisticsInputSelection } from './utils/statisticsInputSelection';
import { formatActivityAction, formatActivityRuleDetail } from './utils/activityLog';
import { getRegistrarMemberCounts, matchesRegistrarMemberFilter } from './utils/memberDirectory';
import { isApproved } from './utils/eligibility';
import PortalNavigation from './components/PortalNavigation';
import PlatformHeader from './components/PlatformHeader';
import PortalAlerts from './components/PortalAlerts';
import CustomDateRangeModal from './components/CustomDateRangeModal';
import DestructiveConfirmationDialog from './components/DestructiveConfirmationDialog';
import SlotActionConfirmationDialog from './components/SlotActionConfirmationDialog';
import { 
  Calendar, MapPin, Users, UserCheck,
  Plus, Filter, Download, ChevronDown,
  CheckCircle2, AlertTriangle, FileText, UserPlus, 
  Mail, Award, Check, X, Lock, Key,
  Edit2, Trash2, Ban, CalendarPlus, HelpCircle, Star, Archive, Search,
  Globe, Shield, UserX, Building2, CheckSquare, Square, BarChart2, Clock, Database,
  Eye, EyeOff
} from 'lucide-react';

const createDefaultActivityLogDateRange = () => {
  const toDate = getTimeZoneDateString(new Date(), DEFAULT_ROSTER_TIME_ZONE);
  return { fromDate: addDaysToIsoDate(toDate, -30), toDate };
};

const normaliseCalendarWeeks = (value) => Math.max(4, Math.min(20, Math.round(Number(value) || 12)));

// The statistics screen is deliberately date-led.  Keeping this calculation
// in one place means the database read and the visible filter always cover the
// same inclusive period.
const getStatisticsDateWindow = (preset, customFromDate, customToDate) => {
  const today = getTimeZoneDateString();
  const currentPeriod = today.slice(0, 7);
  const previousMonth = calendarDateFromIso(`${currentPeriod}-01`);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const previousPeriod = calendarDateToIso(previousMonth).slice(0, 7);

  if (preset === 'CURRENT_AND_PREVIOUS') return { startDate: `${previousPeriod}-01`, endDate: today };
  if (preset === 'CURRENT_MONTH') return { startDate: `${currentPeriod}-01`, endDate: today };
  if (preset === 'LAST_MONTH') {
    const nextMonth = calendarDateFromIso(`${previousPeriod}-01`);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(0);
    return { startDate: `${previousPeriod}-01`, endDate: calendarDateToIso(nextMonth) };
  }
  if (preset === 'CUSTOM') return { startDate: customFromDate, endDate: customToDate };

  // Retains the portal's established definition of “Last 30 days”: today
  // plus the preceding thirty calendar dates.
  return { startDate: addDaysToIsoDate(today, -30), endDate: today };
};

// Warrant numbers are always stored and displayed as JP-12345.  The edit
// fields keep only the numeric part, so members do not need to type the prefix.
const warrantNumberDigits = (value = '') => String(value)
  .trim()
  .toUpperCase()
  .replace(/^JP[\s-]*/i, '')
  .replace(/\D/g, '');

const normaliseWarrantNumber = (value = '') => {
  const digits = warrantNumberDigits(value);
  return digits ? `JP-${digits}` : '';
};

const formatEligibleDeskAdmin = (user) => user.role
  ? `${user.fullName} (${user.role} - ${user.warrantNumber})`
  : `${user.fullName} (${user.warrantNumber})`;

const getShiftDateRangeDescriptor = ({ preset, currentWeek1Monday, fromDate, toDate, subject }) => {
  const today = calendarDateFromIso(getTimeZoneDateString());
  const formatDate = (date) => `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  const weekStart = new Date(currentWeek1Monday);
  const range = (start, end, label) => ({
    label: `Showing ${subject} for ${label} (${formatDate(start)} to ${formatDate(end)})`,
    startDateStr: calendarDateToIso(start),
    endDateStr: calendarDateToIso(end)
  });

  if (preset === 'DEFAULT_13_WEEKS') {
    const start = new Date(weekStart); start.setDate(start.getDate() - 7);
    const end = new Date(weekStart); end.setDate(end.getDate() + 83);
    return range(start, end, '13-week window: Prior Week + Calendar Weeks 1-12');
  }
  if (preset === 'DEFAULT_5WEEKS') {
    const start = new Date(weekStart); start.setDate(start.getDate() - 7);
    const end = new Date(weekStart); end.setDate(end.getDate() + 34);
    return range(start, end, '5-week window: Prior Week + Calendar Weeks 1-4');
  }
  if (preset === 'NEXT_4_WEEKS') {
    const end = new Date(weekStart); end.setDate(end.getDate() + 27);
    return range(weekStart, end, 'Calendar Weeks 1-4');
  }
  if (preset === 'THIS_MONTH') {
    return range(new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 0), 'This Month');
  }
  if (preset === 'LAST_MONTH') {
    return range(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0), 'Last Month');
  }
  if (preset === 'NEXT_MONTH') {
    return range(new Date(today.getFullYear(), today.getMonth() + 1, 1), new Date(today.getFullYear(), today.getMonth() + 2, 0), 'Next Month');
  }
  if (preset === 'CUSTOM') {
    return {
      label: `Showing ${subject} for Custom Date Range (${formatDate(calendarDateFromIso(fromDate))} to ${formatDate(calendarDateFromIso(toDate))})`,
      startDateStr: fromDate,
      endDateStr: toDate
    };
  }
  return { label: `Showing ${subject}`, startDateStr: '1970-01-01', endDateStr: '2099-12-31' };
};

const EMPTY_SIGN_UP_FORM = { fullName: '', email: '', phone: '', warrantNumber: '', password: '', confirmPassword: '', isProvisional: false };

export default function App({ initialProfile = null, initialRecovery = false, onSessionChange }) {
  // --- AUTH & GLOBAL STATE ---
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authRestoring, setAuthRestoring] = useState(true);
  const [activeTab, setActiveTab] = useState('calendar');
  // A statistics-reminder link is deliberately resolved only after the JP
  // signs in. The database verifies that the link belongs to that JP.
  const [statisticsReminderToken, setStatisticsReminderToken] = useState(() => new URLSearchParams(window.location.search).get('statsReminder') || '');
  const statisticsReminderOpening = useRef(false);
  const [profileForm, setProfileForm] = useState({ email: '', phone: '', warrantNumber: '', calendarWeeks: 12, reminderFrequency: 'NONE', reminderStartDate: '', reminderWeeks: 4 });
  const [profileSaveMessage, setProfileSaveMessage] = useState('');
  const [profileSaveError, setProfileSaveError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [showUnauthHelp, setShowUnauthHelp] = useState(false);
  const [calendarNow, setCalendarNow] = useState(() => new Date());
  // Refresh action availability while a member leaves the portal open.
  const [actionClock, setActionClock] = useState(() => new Date());
  const [preferencesReadyForProfile, setPreferencesReadyForProfile] = useState(null);
  // Demo access is deliberately unavailable in deployed builds. To use it on
  // a local developer machine, explicitly set VITE_ENABLE_DEMO=true.
  const demoModeEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO === 'true';

  const [users, setUsers] = useState(INITIAL_USERS);
  const [regions, setRegions] = useState(INITIAL_REGIONS);
  const [serviceDesks, setServiceDesks] = useState(INITIAL_SERVICE_DESKS);
  const [slotTemplates, setSlotTemplates] = useState(INITIAL_SLOT_TEMPLATES);
  const [followedDesks, setFollowedDesks] = useState(INITIAL_FOLLOWED_DESKS);

  const [slotAssignments, setSlotAssignments] = useState(INITIAL_ASSIGNMENTS);
  const [cancelledSlotInstances, _setCancelledSlotInstances] = useState([]);
  const [loggedStatistics, setLoggedStatistics] = useState(INITIAL_LOGGED_STATISTICS);
  const [statutoryHolidays, setStatutoryHolidays] = useState([]);
  const [slotHolidayOverrides, setSlotHolidayOverrides] = useState([]);
  const [rosterActivityAudit, setRosterActivityAudit] = useState([]);
  const [rosterActivityAuditError, setRosterActivityAuditError] = useState('');
  const [activityLogRange, setActivityLogRange] = useState('LAST_250');
  const [activityLogCustomModalOpen, setActivityLogCustomModalOpen] = useState(false);
  const [activityLogCustomFrom, setActivityLogCustomFrom] = useState(() => createDefaultActivityLogDateRange().fromDate);
  const [activityLogCustomTo, setActivityLogCustomTo] = useState(() => createDefaultActivityLogDateRange().toDate);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [dutyNotificationFailures, setDutyNotificationFailures] = useState([]);
  const [dutyNotificationFailuresError, setDutyNotificationFailuresError] = useState('');
  const [dutyNotificationFailuresLoading, setDutyNotificationFailuresLoading] = useState(false);
  const [retryingDutyNotificationId, setRetryingDutyNotificationId] = useState(null);
  const [rosterOperationalHealth, setRosterOperationalHealth] = useState(null);
  const [rosterOperationalHealthError, setRosterOperationalHealthError] = useState('');
  const [rosterOperationalHealthLoading, setRosterOperationalHealthLoading] = useState(false);

  // REGISTRATION & WITHDRAWAL MODAL STATES
  const [registerModalOcc, setRegisterModalOcc] = useState(null);
  const [pastRegistrationConfirmationOcc, setPastRegistrationConfirmationOcc] = useState(null);
  const [registerOption, setRegisterOption] = useState('SINGLE'); // 'SINGLE', 'NEXT_N', 'UNTIL_DATE', 'ALL_FUTURE'
  const [registerCountN, setRegisterCountN] = useState(4);
  const [registerUntilDate, setRegisterUntilDate] = useState('2026-12-31');

  const [withdrawModalOcc, setWithdrawModalOcc] = useState(null);
  const [pastWithdrawalConfirmationOcc, setPastWithdrawalConfirmationOcc] = useState(null);
  const [withdrawOption, setWithdrawOption] = useState('SINGLE'); // 'SINGLE', 'NEXT_N', 'UNTIL_DATE', 'ALL_FUTURE'
  const [withdrawCountN, setWithdrawCountN] = useState(4);
  const [withdrawUntilDate, setWithdrawUntilDate] = useState('2026-12-31');

  // AUTH SCREEN MODALS & FORMS
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [pendingApprovalUser, setPendingApprovalUser] = useState(null);

  // PENDING MEMBERS REGISTRAR POPUP
  const [pendingMembersNoticeCount, setPendingMembersNoticeCount] = useState(0);

  // Sign Up Modal State
  const [signUpModalOpen, setSignUpModalOpen] = useState(false);
  const [signUpForm, setSignUpForm] = useState(EMPTY_SIGN_UP_FORM);
  const [signUpSuccessMsg, setSignUpSuccessMsg] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showSignUpConfirmPassword, setShowSignUpConfirmPassword] = useState(false);
  const [signUpPasswordError, setSignUpPasswordError] = useState('');

  // Forgot Password & Reset Modal State
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLinkSent, setResetLinkSent] = useState(false);

  const [resetScreenOpen, setResetScreenOpen] = useState(initialRecovery);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetError, setResetError] = useState('');


  // Desk & Calendar Filters
  const [deskViewFilter, setDeskViewFilter] = useState('Active');
  const [selectedDeskRegions, setSelectedDeskRegions] = useState(INITIAL_REGIONS.map(r => r.name));
  const [calendarDeskFilter, setCalendarDeskFilter] = useState('FOLLOWED');
  const [memberCalendarDeskIds, setMemberCalendarDeskIds] = useState([]);
  const [calendarRegionFilter, setCalendarRegionFilter] = useState('ALL');
  const [calendarFilterSections, setCalendarFilterSections] = useState({ location: false, time: false, days: false });
  
  // 12-WEEK CALENDAR TIME OF DAY FILTER
  const [calendarTimeOfDayFilter, setCalendarTimeOfDayFilter] = useState({ ...DEFAULT_TIME_OF_DAY_FILTER });
  // Day filter is especially useful on portrait phones: members can focus on
  // their preferred duty days without changing their followed desks.
  const [calendarDayFilter, setCalendarDayFilter] = useState({ ...DEFAULT_DAY_FILTER });
  const [calendarDisplayWeeks, setCalendarDisplayWeeks] = useState(12);

  // MY SHIFTS TAB FILTERS
  const [myShiftsPreset, setMyShiftsPreset] = useState('DEFAULT_13_WEEKS');
  const [myShiftsDeskFilter, setMyShiftsDeskFilter] = useState('ALL');
  const [myShiftsCustomModalOpen, setMyShiftsCustomModalOpen] = useState(false);
  const [myShiftsCustomFrom, setMyShiftsCustomFrom] = useState('2026-08-31');
  const [myShiftsCustomTo, setMyShiftsCustomTo] = useState('2026-10-04');

  // STATISTICS TAB FILTERS
  const [statsRegionFilter, setStatsRegionFilter] = useState('ALL');
  const [statsDeskFilter, setStatsDeskFilter] = useState('ALL');
  const [statsJpFilter, setStatsJpFilter] = useState('ALL');
  const [statsDatePreset, setStatsDatePreset] = useState('LAST_30_DAYS');
  const [customDateModalOpen, setCustomDateModalOpen] = useState(false);
  const [customFromDate, setCustomFromDate] = useState('2026-08-01');
  const [customToDate, setCustomToDate] = useState('2026-09-30');

  // EDITING EXISTING STATS RECORD MODAL
  const [editingStatRecord, setEditingStatRecord] = useState(null);
  const [editStatForm, setEditStatForm] = useState({
    dutyDate: '',
    startTime: '',
    noOfJpDuties: 1,
    noOfClients: 0,
    noOfHoursWorked: 2.00,
    certifiedCopies: 0,
    statutoryDeclarations: 0,
    signatureWitnessed: 0,
    affidavits: 0,
    other: 0,
    notes: ''
  });
  const [confirmDeleteStatId, setConfirmDeleteStatId] = useState(null);

  // Log Stats Modal State
  const [logStatsOccurrence, setLogStatsOccurrence] = useState(null);
  const [statsForm, setStatsForm] = useState({
    noOfJpDuties: 1,
    noOfClients: 0,
    noOfHoursWorked: 2.00,
    certifiedCopies: 0,
    statutoryDeclarations: 0,
    signatureWitnessed: 0,
    affidavits: 0,
    other: 0,
    notes: ''
  });
  const [statsSuccessToast, setStatsSuccessToast] = useState(false);
  const [registrationSuccessToast, setRegistrationSuccessToast] = useState(false);
  const [statisticsSubjectUser, setStatisticsSubjectUser] = useState(null);

  // Desk Maintenance is deliberately separate from members' self-service
  // calendar. Staff can only act for JPs at desks they administer.
  const [deskMaintenanceSubTab, setDeskMaintenanceSubTab] = useState('assign-jps');
  const [deskMaintenanceDatePreset, setDeskMaintenanceDatePreset] = useState('DEFAULT_13_WEEKS');
  const [deskMaintenanceDeskFilter, setDeskMaintenanceDeskFilter] = useState('ALL');
  const [deskMaintenanceCustomModalOpen, setDeskMaintenanceCustomModalOpen] = useState(false);
  const [deskMaintenanceCustomFrom, setDeskMaintenanceCustomFrom] = useState('2026-08-31');
  const [deskMaintenanceCustomTo, setDeskMaintenanceCustomTo] = useState('2026-10-04');
  const [deskMaintenanceMemberSelections, setDeskMaintenanceMemberSelections] = useState({});
  const [deskMaintenanceStatsFilter, setDeskMaintenanceStatsFilter] = useState('LAST_4_WEEKS');
  const [deskMaintenanceContacts, setDeskMaintenanceContacts] = useState([]);
  const [deskMaintenanceContactsError, setDeskMaintenanceContactsError] = useState('');
  const [deskMaintenanceContactsLoading, setDeskMaintenanceContactsLoading] = useState(false);
  const [incompleteDutyStatistics, setIncompleteDutyStatistics] = useState([]);
  const [incompleteDutyStatisticsError, setIncompleteDutyStatisticsError] = useState('');
  const [incompleteDutyStatisticsLoading, setIncompleteDutyStatisticsLoading] = useState(false);

  // Full Slot Details Modal State
  const [detailedSlotModal, setDetailedSlotModal] = useState(null);

  // Registrar Portal Subtab State
  const [registrarSubTab, setRegistrarSubTab] = useState('members');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState({ fullName: '', email: '', phone: '', warrantNumber: '', password: 'password123', role: 'Member', isProvisional: false, status: 'Approved' });
  const [pendingArchiveUserId, setPendingArchiveUserId] = useState(null);
  const [archivePreview, setArchivePreview] = useState(null);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const [lifecycleError, setLifecycleError] = useState('');
  const [pendingReinstateUser, setPendingReinstateUser] = useState(null);
  const [reinstateRole, setReinstateRole] = useState('');
  const [reinstateSubmitting, setReinstateSubmitting] = useState(false);
  const [memberDirectoryFilter, setMemberDirectoryFilter] = useState('ACTIVE');
  const [memberDirectorySearch, setMemberDirectorySearch] = useState('');

  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [editingRegionId, setEditingRegionId] = useState(null);
  const [regionForm, setRegionForm] = useState({ name: '', code: '', timezone: DEFAULT_ROSTER_TIME_ZONE });
  const [pendingDeleteRegionId, setPendingDeleteRegionId] = useState(null);

  const regionTimeZoneOptions = useMemo(() => [...new Set([
    ...IANA_TIME_ZONES,
    regionForm.timezone || DEFAULT_ROSTER_TIME_ZONE
  ])].sort((first, second) => {
    if (first === DEFAULT_ROSTER_TIME_ZONE) return -1;
    if (second === DEFAULT_ROSTER_TIME_ZONE) return 1;
    return first.localeCompare(second);
  }), [regionForm.timezone]);

  // REGISTRAR MASTER DOWNLOAD CONFIRMATION MODAL STATE
  const [confirmDownloadModalOpen, setConfirmDownloadModalOpen] = useState(false);
  const [archivePreparing, setArchivePreparing] = useState(false);
  const [preparedFullArchiveData, setPreparedFullArchiveData] = useState(null);

  // SLOT TEMPLATE MODAL, VALIDATION & ACTION CONFIRMATION STATES
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [slotForm, setSlotForm] = useState({
    deskId: 'desk-remuera',
    dayOfWeek: 'Tuesday',
    startTime: '10:00',
    endTime: '12:00',
    minJps: 1,
    targetJps: 1,
    maxJps: 2,
    status: 'Active',
    effectiveFromDate: '2026-09-01'
  });
  const [slotValidationError, setSlotValidationError] = useState('');
  const [pendingDeleteSlotId, setPendingDeleteSlotId] = useState(null);
  const [slotActionConfirm, setSlotActionConfirm] = useState(null);

  // STATUTORY HOLIDAY ADMINISTRATION (Registrar-only)
  const [holidayForm, setHolidayForm] = useState({ date: '', description: '' });
  const [editingStatutoryHolidayId, setEditingStatutoryHolidayId] = useState(null);

  // SERVICE DESK MODALS WITH EXPANDED ADMIN & SITE CONTACT FIELDS
  const [createDeskModalOpen, setCreateDeskModalOpen] = useState(false);
  const [editingDeskId, setEditingDeskId] = useState(null);
  const [editDeskForm, setEditDeskForm] = useState({ 
    code: '', 
    name: '', 
    address: '', 
    region: 'Auckland East', 
    primaryAdminId: '', 
    secondaryAdminId: '', 
    siteContactName: '', 
    siteContactEmail: '', 
    contactPerson: '', 
    notes: '' 
  });
  const [newDeskForm, setNewDeskForm] = useState({ 
    code: '', 
    name: '', 
    address: '', 
    region: 'Auckland East', 
    primaryAdminId: '', 
    secondaryAdminId: '', 
    siteContactName: '', 
    siteContactEmail: '', 
    contactPerson: '', 
    notes: '' 
  });
  const [pendingDeleteDeskId, setPendingDeleteDeskId] = useState(null);

  // Stage 1: load the existing UI state from Supabase after authenticated login.
  // The mapping keeps the current component working while later stages replace
  // its in-memory write handlers with database mutations.
  const loadSupabaseRoster = async (profile) => {
    if (!isApproved(profile)) throw new Error('Approved membership is required to load the roster.');
    setPreferencesReadyForProfile(null);
    // A full statistics history can grow indefinitely. Sign-in needs only the
    // current reporting window; subsequent filter changes refresh that bounded
    // window without reloading the roster.
    const defaultStatisticsWindow = getStatisticsDateWindow('LAST_30_DAYS', '', '');
    const roster = await fetchRosterData(profile.id, {
      ...getOperationalRosterWindow(),
      statisticsStartDate: defaultStatisticsWindow.startDate,
      statisticsEndDate: defaultStatisticsWindow.endDate
    });
    setUsers(roster.users); setRegions(roster.regions); setServiceDesks(roster.desks); setSlotTemplates(roster.slots);
    setFollowedDesks(roster.followedDesks); setSlotAssignments(roster.assignments);
    setLoggedStatistics(roster.statistics);
    setStatutoryHolidays(roster.statutoryHolidays); setSlotHolidayOverrides(roster.slotHolidayOverrides);

    const profileCanUseDeskMaintenance = profile.role === 'Registrar'
      || (profile.role === 'Admin' && roster.desks.some(desk => !desk.isHomeBasedService && (desk.primaryAdminId === profile.id || desk.secondaryAdminId === profile.id)));
    if (profileCanUseDeskMaintenance) {
      try {
        setActivityLogRange('LAST_250');
        setActivityLogCustomModalOpen(false);
        setRosterActivityAudit(await fetchRosterActivityAudit());
        setRosterActivityAuditError('');
      } catch (auditError) {
        // The rest of the portal stays available until the audit migration has
        // been applied. The screen explains this to the authorised user.
        console.warn('Roster activity audit could not be loaded:', auditError.message);
        setRosterActivityAudit([]);
        setRosterActivityAuditError(auditError.message);
      }
      try {
        setIncompleteDutyStatisticsLoading(true);
        setIncompleteDutyStatistics(await fetchIncompleteDutyStatistics());
        setIncompleteDutyStatisticsError('');
      } catch (statisticsError) {
        // The default four-week view stays usable until this optional
        // staff-only historical query has been installed in Supabase.
        console.warn('Incomplete duty statistics could not be loaded:', statisticsError.message);
        setIncompleteDutyStatistics([]);
        setIncompleteDutyStatisticsError(statisticsError.message);
      } finally {
        setIncompleteDutyStatisticsLoading(false);
      }
    } else {
      setRosterActivityAudit([]);
      setRosterActivityAuditError('');
      setIncompleteDutyStatistics([]);
      setIncompleteDutyStatisticsError('');
      setIncompleteDutyStatisticsLoading(false);
    }

    if (profile.role === 'Registrar') {
      try {
        setDutyNotificationFailures(await fetchDutyNotificationFailures());
        setDutyNotificationFailuresError('');
      } catch (notificationError) {
        // Stage 3B is an operational aid only. A missing migration must not
        // prevent a Registrar from using the rest of the portal.
        console.warn('Duty notification failures could not be loaded:', notificationError.message);
        setDutyNotificationFailures([]);
        setDutyNotificationFailuresError(notificationError.message);
      }
      try {
        setRosterOperationalHealth(await fetchRosterOperationalHealth());
        setRosterOperationalHealthError('');
      } catch (healthError) {
        // Stage 13 adds an operational summary only. A missing migration must
        // never block the Registrar's normal roster-management work.
        console.warn('Roster operational health could not be loaded:', healthError.message);
        setRosterOperationalHealth(null);
        setRosterOperationalHealthError(healthError.message);
      }
    } else {
      setDutyNotificationFailures([]);
      setDutyNotificationFailuresError('');
      setRosterOperationalHealth(null);
      setRosterOperationalHealthError('');
    }

    // Reset to the familiar defaults first. The saved values below then take
    // precedence where they exist, including when another account signs in on
    // the same browser.
    setCalendarDeskFilter(profile.role === 'Member' ? 'FOLLOWED' : 'ALL');
    setMemberCalendarDeskIds(profile.role === 'Member' ? roster.followedDesks : []);
    setCalendarRegionFilter('ALL');
    setCalendarTimeOfDayFilter({ ...DEFAULT_TIME_OF_DAY_FILTER });
    setCalendarDayFilter({ ...DEFAULT_DAY_FILTER });
    setCalendarDisplayWeeks(12);
    setMyShiftsPreset('DEFAULT_13_WEEKS');
    setMyShiftsDeskFilter('ALL');
    setDeskMaintenanceDatePreset('DEFAULT_13_WEEKS');
    setDeskMaintenanceDeskFilter('ALL');
    setDeskViewFilter('Active');
    setSelectedDeskRegions(roster.regions.map(region => region.name));
    setStatsRegionFilter('ALL');
    setStatsDeskFilter('ALL');
    setStatsJpFilter(profile.role === 'Member' ? profile.id : 'ALL');
    setStatsDatePreset('LAST_30_DAYS');

    if (roster.preferencesError) {
      // Do not prevent sign-in if Stage 4A has not yet been run in Supabase.
      console.warn('User preferences were not loaded:', roster.preferencesError.message);
    } else if (roster.preferences) {
      const calendar = roster.preferences.calendar_filters || {};
      const myShifts = roster.preferences.my_shifts_filters || {};
      const deskMaintenance = roster.preferences.desk_maintenance_filters || {};
      const statistics = roster.preferences.statistics_filters || {};
      if (typeof calendar.desk === 'string') setCalendarDeskFilter(calendar.desk);
      if (profile.role === 'Member' && Array.isArray(calendar.member_desk_ids)) {
        // A desk can be unfollowed after the preference was last saved; do not
        // retain it as an invisible selected filter option.
        setMemberCalendarDeskIds(calendar.member_desk_ids.filter(deskId => roster.followedDesks.includes(deskId)));
      }
      if (typeof calendar.region === 'string') setCalendarRegionFilter(calendar.region);
      if (calendar.time_of_day && typeof calendar.time_of_day === 'object') setCalendarTimeOfDayFilter(previous => ({ ...previous, ...calendar.time_of_day }));
      if (calendar.days && typeof calendar.days === 'object') setCalendarDayFilter(previous => ({ ...previous, ...calendar.days }));
      if (Number.isInteger(calendar.weeks) || typeof calendar.weeks === 'string') {
        setCalendarDisplayWeeks(normaliseCalendarWeeks(calendar.weeks));
      }
      if (calendar.service_desks?.view === 'Active' || calendar.service_desks?.view === 'Archived') {
        setDeskViewFilter(calendar.service_desks.view);
      }
      if (Array.isArray(calendar.service_desks?.regions)) {
        const validRegionNames = new Set(roster.regions.map(region => region.name));
        setSelectedDeskRegions(calendar.service_desks.regions.filter(regionName => validRegionNames.has(regionName)));
      }
      if (typeof myShifts.preset === 'string') setMyShiftsPreset(myShifts.preset);
      if (typeof myShifts.desk === 'string') setMyShiftsDeskFilter(myShifts.desk);
      if (typeof myShifts.from === 'string') setMyShiftsCustomFrom(myShifts.from);
      if (typeof myShifts.to === 'string') setMyShiftsCustomTo(myShifts.to);
      if (typeof deskMaintenance.preset === 'string') setDeskMaintenanceDatePreset(deskMaintenance.preset);
      if (typeof deskMaintenance.desk === 'string') setDeskMaintenanceDeskFilter(deskMaintenance.desk);
      if (typeof deskMaintenance.from === 'string') setDeskMaintenanceCustomFrom(deskMaintenance.from);
      if (typeof deskMaintenance.to === 'string') setDeskMaintenanceCustomTo(deskMaintenance.to);
      if (typeof statistics.region === 'string') setStatsRegionFilter(statistics.region);
      if (typeof statistics.desk === 'string') setStatsDeskFilter(statistics.desk);
      if (typeof statistics.jp === 'string') setStatsJpFilter(statistics.jp);
      if (typeof statistics.date_preset === 'string') setStatsDatePreset(statistics.date_preset);
      if (typeof statistics.custom_from === 'string') setCustomFromDate(statistics.custom_from);
      if (typeof statistics.custom_to === 'string') setCustomToDate(statistics.custom_to);
    }
    setPreferencesReadyForProfile(profile.id);
    return roster;
  };

  const handleRefreshDutyNotificationFailures = async () => {
    if (currentUser?.role !== 'Registrar') return;
    setDutyNotificationFailuresLoading(true);
    try {
      setDutyNotificationFailures(await fetchDutyNotificationFailures());
      setDutyNotificationFailuresError('');
    } catch (notificationError) {
      setDutyNotificationFailuresError(notificationError.message);
    } finally {
      setDutyNotificationFailuresLoading(false);
    }
  };

  const handleRefreshRosterOperationalHealth = async () => {
    if (currentUser?.role !== 'Registrar') return;
    setRosterOperationalHealthLoading(true);
    try {
      setRosterOperationalHealth(await fetchRosterOperationalHealth());
      setRosterOperationalHealthError('');
    } catch (healthError) {
      setRosterOperationalHealthError(healthError.message);
    } finally {
      setRosterOperationalHealthLoading(false);
    }
  };

  const handleRetryDutyNotificationFailure = async (notification) => {
    if (!window.confirm(`Return the failed ${notification.dutyDate} email for ${notification.memberName} to the delivery queue? The system will retry it shortly.`)) return;

    setRetryingDutyNotificationId(notification.id);
    try {
      await retryDutyNotificationFailure(notification.id);
      await handleRefreshDutyNotificationFailures();
      alert('The email has been returned to the delivery queue. Refresh this screen in a few minutes to confirm the result.');
    } catch (notificationError) {
      alert(`Unable to retry this email: ${notificationError.message}`);
    } finally {
      setRetryingDutyNotificationId(null);
    }
  };

  // Restore an existing Supabase session after a page refresh. This avoids
  // making members sign in again while their browser session remains valid.
  useEffect(() => {
    let isMounted = true;
    const hashParameters = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const restoreSession = async () => {
      // Let the password-recovery event open its dedicated password screen.
      if (hashParameters.get('type') === 'recovery') {
        if (isMounted) setAuthRestoring(false);
        return;
      }

      try {
        const restoredUser = initialProfile;
        if (!restoredUser || !isMounted) return;

        if (restoredUser.status !== 'Approved') {
          setPendingApprovalUser(restoredUser);
          return;
        }

        const roster = await loadSupabaseRoster(restoredUser);
        if (!isMounted) return;

        setCurrentUser(restoredUser);
        setIsAuthenticated(true);
        setActiveTab('calendar');
        if (restoredUser.role === 'Registrar') {
          setPendingMembersNoticeCount(roster.users.filter(user => user.status === 'Pending').length);
        }
      } catch (restoreError) {
        console.warn('Saved session could not be restored:', restoreError.message);
        if (isMounted) setLoginError(`Unable to load roster data: ${restoreError.message}. Refresh the page to retry.`);
      } finally {
        if (isMounted) setAuthRestoring(false);
      }
    };

    restoreSession();
    return () => { isMounted = false; };
  }, [initialProfile]);

  // A single-page app has no browser history entries for its tabs. Add a
  // portal entry while signed in so Android Back returns to the Calendar (and
  // closes any open action window) instead of immediately closing the app.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const portalHistoryState = { ajpaPortal: true };
    window.history.pushState(portalHistoryState, '', window.location.href);
    const handleBrowserBack = () => {
      setRegisterModalOcc(null);
      setPastRegistrationConfirmationOcc(null);
      setWithdrawModalOcc(null);
      setPastWithdrawalConfirmationOcc(null);
      setDetailedSlotModal(null);
      setLogStatsOccurrence(null);
      setActiveTab('calendar');
      window.history.pushState(portalHistoryState, '', window.location.href);
    };

    window.addEventListener('popstate', handleBrowserBack);
    return () => window.removeEventListener('popstate', handleBrowserBack);
  }, [isAuthenticated]);

  // Escape consistently dismisses the active portal dialog, including
  // confirmation prompts and date-range windows. It never confirms an action.
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key !== 'Escape') return;

      if (pendingDeleteDeskId) setPendingDeleteDeskId(null);
      else if (pendingDeleteRegionId) setPendingDeleteRegionId(null);
      else if (pendingReinstateUser) setPendingReinstateUser(null);
      else if (pendingArchiveUserId) { setPendingArchiveUserId(null); setArchivePreview(null); }
      else if (confirmDeleteStatId) setConfirmDeleteStatId(null);
      else if (pendingDeleteSlotId) setPendingDeleteSlotId(null);
      else if (slotActionConfirm) setSlotActionConfirm(null);
      else if (confirmDownloadModalOpen) setConfirmDownloadModalOpen(false);
      else if (activityLogCustomModalOpen) setActivityLogCustomModalOpen(false);
      else if (myShiftsCustomModalOpen) setMyShiftsCustomModalOpen(false);
      else if (deskMaintenanceCustomModalOpen) setDeskMaintenanceCustomModalOpen(false);
      else if (customDateModalOpen) setCustomDateModalOpen(false);
      else if (pastRegistrationConfirmationOcc) setPastRegistrationConfirmationOcc(null);
      else if (pastWithdrawalConfirmationOcc) setPastWithdrawalConfirmationOcc(null);
      else if (registerModalOcc) setRegisterModalOcc(null);
      else if (withdrawModalOcc) setWithdrawModalOcc(null);
      else if (detailedSlotModal) setDetailedSlotModal(null);
      else if (logStatsOccurrence) setLogStatsOccurrence(null);
      else if (editingStatRecord) setEditingStatRecord(null);
      else if (slotModalOpen) setSlotModalOpen(false);
      else if (userModalOpen) setUserModalOpen(false);
      else if (regionModalOpen) setRegionModalOpen(false);
      else if (createDeskModalOpen) setCreateDeskModalOpen(false);
      else if (signUpModalOpen) {
        setSignUpSuccessMsg(false);
        setSignUpForm(EMPTY_SIGN_UP_FORM);
        setShowSignUpPassword(false);
        setShowSignUpConfirmPassword(false);
        setSignUpPasswordError('');
        setSignUpModalOpen(false);
      } else if (forgotModalOpen) setForgotModalOpen(false);
      else if (pendingMembersNoticeCount > 0) setPendingMembersNoticeCount(0);
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [
    activityLogCustomModalOpen,
    confirmDeleteStatId,
    confirmDownloadModalOpen,
    createDeskModalOpen,
    customDateModalOpen,
    detailedSlotModal,
    deskMaintenanceCustomModalOpen,
    editingStatRecord,
    forgotModalOpen,
    logStatsOccurrence,
    myShiftsCustomModalOpen,
    pastRegistrationConfirmationOcc,
    pastWithdrawalConfirmationOcc,
    pendingArchiveUserId,
    pendingReinstateUser,
    pendingDeleteDeskId,
    pendingDeleteRegionId,
    pendingDeleteSlotId,
    pendingMembersNoticeCount,
    regionModalOpen,
    registerModalOcc,
    signUpModalOpen,
    slotActionConfirm,
    slotModalOpen,
    userModalOpen,
    withdrawModalOcc
  ]);

  const handleToggleFollowDesk = async (deskId) => {
    if (!currentUser) return;
    const isFollowed = followedDesks.includes(deskId);
    const query = isFollowed
      ? supabase.from('desk_follows').delete().eq('profile_id', currentUser.id).eq('desk_id', deskId)
      : supabase.from('desk_follows').insert({ profile_id: currentUser.id, desk_id: deskId });
    const { error } = await query;
    if (error) { alert(`Unable to update followed desks: ${error.message}`); return; }
    setFollowedDesks(previous => isFollowed ? previous.filter(id => id !== deskId) : [...previous, deskId]);

    // For JP Members, following a desk means they expect to see it straight
    // away on their personal Calendar. Keep the saved Calendar desk selection
    // in step with the Follow/Unfollow action rather than making them open a
    // second filter panel to select it again.
    if (currentUser.role === 'Member') {
      setMemberCalendarDeskIds(previous => isFollowed
        ? previous.filter(id => id !== deskId)
        : [...new Set([...previous, deskId])]);
    }
  };

  useEffect(() => {
    // A saved preference loaded for this account must not be overwritten by
    // the login defaults below.
    if (!currentUser || preferencesReadyForProfile === currentUser.id) return;

    if (currentUser?.role === 'Member') {
      setCalendarDeskFilter('FOLLOWED');
      setStatsJpFilter(currentUser.id);
    } else {
      setCalendarDeskFilter('ALL');
      setStatsJpFilter('ALL');
    }
  }, [currentUser, preferencesReadyForProfile]);

  // Supabase emits PASSWORD_RECOVERY after a member follows their email link.
  // Only then is the password-entry screen made available.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setAuthRestoring(false);
        setForgotModalOpen(false);
        setResetLinkSent(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        setResetScreenOpen(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const clockTimer = window.setInterval(() => setActionClock(new Date()), 30000);
    return () => window.clearInterval(clockTimer);
  }, []);

  // Save display choices shortly after a filter is changed. The short delay
  // groups a series of checkbox clicks into one Supabase write.
  useEffect(() => {
    if (!currentUser || preferencesReadyForProfile !== currentUser.id) return undefined;

    const saveTimer = window.setTimeout(async () => {
      try {
        await saveUserPreferences(currentUser.id, {
        calendar_filters: {
          desk: calendarDeskFilter,
          member_desk_ids: memberCalendarDeskIds,
          region: calendarRegionFilter,
          time_of_day: calendarTimeOfDayFilter,
          days: calendarDayFilter,
          weeks: calendarDisplayWeeks,
          service_desks: {
            view: deskViewFilter,
            regions: selectedDeskRegions
          }
        },
        my_shifts_filters: {
          preset: myShiftsPreset,
          desk: myShiftsDeskFilter,
          from: myShiftsCustomFrom,
          to: myShiftsCustomTo
        },
        desk_maintenance_filters: {
          preset: deskMaintenanceDatePreset,
          desk: deskMaintenanceDeskFilter,
          from: deskMaintenanceCustomFrom,
          to: deskMaintenanceCustomTo
        },
        statistics_filters: {
          region: statsRegionFilter,
          desk: statsDeskFilter,
          jp: statsJpFilter,
          date_preset: statsDatePreset,
          custom_from: customFromDate,
          custom_to: customToDate
        }
        });
      } catch (preferencesSaveError) {
        console.warn('User preferences were not saved:', preferencesSaveError.message);
      }
    }, 400);

    return () => window.clearTimeout(saveTimer);
  }, [
    currentUser,
    preferencesReadyForProfile,
    calendarDeskFilter,
    memberCalendarDeskIds,
    calendarRegionFilter,
    calendarTimeOfDayFilter,
    calendarDayFilter,
    calendarDisplayWeeks,
    myShiftsPreset,
    myShiftsDeskFilter,
    myShiftsCustomFrom,
    myShiftsCustomTo,
    deskMaintenanceDatePreset,
    deskMaintenanceDeskFilter,
    deskMaintenanceCustomFrom,
    deskMaintenanceCustomTo,
    deskViewFilter,
    selectedDeskRegions,
    statsRegionFilter,
    statsDeskFilter,
    statsJpFilter,
    statsDatePreset,
    customFromDate,
    customToDate
  ]);

  const canManage = useMemo(() => {
    return isApproved(currentUser) && (currentUser.role === 'Admin' || currentUser.role === 'Registrar');
  }, [currentUser]);

  // The interface must match the database's Stage 2B desk scope.  Registrars
  // may maintain every desk; an Admin may maintain only a desk where they are
  // the recorded Primary or Secondary Desk Admin.
  const canMaintainDesk = (deskOrId) => {
    if (!isApproved(currentUser)) return false;
    if (currentUser.role === 'Registrar') return true;
    if (currentUser.role !== 'Admin') return false;
    const desk = typeof deskOrId === 'string'
      ? serviceDesks.find(item => item.id === deskOrId)
      : deskOrId;
    return Boolean(desk && (desk.primaryAdminId === currentUser.id || desk.secondaryAdminId === currentUser.id));
  };

  const isCurrentUserDeskAdmin = useMemo(() => {
    if (!isApproved(currentUser) || !['Admin', 'Registrar'].includes(currentUser.role)) return false;
    return serviceDesks.some(desk => !desk.isHomeBasedService && (desk.primaryAdminId === currentUser.id || desk.secondaryAdminId === currentUser.id));
  }, [currentUser, serviceDesks]);

  const canUseDeskMaintenance = useMemo(() => (
    isApproved(currentUser) && (currentUser.role === 'Registrar' || isCurrentUserDeskAdmin)
  ), [currentUser, isCurrentUserDeskAdmin]);

  const canViewActivityAudit = canUseDeskMaintenance;

  useEffect(() => {
    if (!currentUser) return;
    setProfileForm({
      email: currentUser.email || '',
      phone: currentUser.phone || '',
      warrantNumber: warrantNumberDigits(currentUser.warrantNumber),
      calendarWeeks: currentUser.calendarWeeks || calendarDisplayWeeks,
      reminderFrequency: currentUser.reminderFrequency || 'NONE',
      reminderStartDate: currentUser.reminderStartDate || '',
      reminderWeeks: currentUser.reminderWeeks || 4
    });
    setProfileSaveMessage('');
    setProfileSaveError('');
  }, [currentUser, calendarDisplayWeeks]);

  const eligibleAdminsList = useMemo(() => {
    return users.filter(user => user.status === 'Approved' && user.role === 'Admin');
  }, [users]);

  const userMap = useMemo(() => {
    return users.reduce((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {});
  }, [users]);

  const sortedUsersForRegistrar = useMemo(() => {
    const parseName = (fullName) => {
      const cleanName = fullName.replace(/\s*\((?:JP|A|R)\)\s*/g, '').trim();
      const parts = cleanName.split(/\s+/);
      if (parts.length === 1) {
        return { firstName: parts[0], lastName: '' };
      }
      const lastName = parts.pop();
      const firstName = parts.join(' ');
      return { firstName, lastName };
    };

    const pending = users.filter(u => u.status === 'Pending');
    const nonPending = users.filter(u => u.status !== 'Pending');

    const sortFn = (a, b) => {
      const nameA = parseName(a.fullName);
      const nameB = parseName(b.fullName);

      const lastNameCompare = nameA.lastName.localeCompare(nameB.lastName, undefined, { sensitivity: 'base' });
      if (lastNameCompare !== 0) return lastNameCompare;

      const firstNameCompare = nameA.firstName.localeCompare(nameB.firstName, undefined, { sensitivity: 'base' });
      if (firstNameCompare !== 0) return firstNameCompare;

      return (a.warrantNumber || '').localeCompare(b.warrantNumber || '', undefined, { numeric: true, sensitivity: 'base' });
    };

    pending.sort(sortFn);
    nonPending.sort(sortFn);

    return [...pending, ...nonPending];
  }, [users]);


  const memberDirectoryCounts = useMemo(() => getRegistrarMemberCounts(users), [users]);


  const visibleUsersForRegistrar = useMemo(() => {
    const searchTerm = memberDirectorySearch.trim().toLocaleLowerCase();

    return sortedUsersForRegistrar.filter(user => {

      const matchesFilter = matchesRegistrarMemberFilter(user, memberDirectoryFilter);

      if (!matchesFilter) return false;
      if (!searchTerm) return true;

      return [user.fullName, user.warrantNumber, user.email, user.phone, user.role, user.status]
        .some(value => String(value || '').toLocaleLowerCase().includes(searchTerm));
    });
  }, [memberDirectoryFilter, memberDirectorySearch, sortedUsersForRegistrar]);

  const activeDeskMap = useMemo(() => {
    return serviceDesks.reduce((acc, desk) => {
      acc[desk.id] = desk;
      return acc;
    }, {});
  }, [serviceDesks]);

  const activeDesksList = useMemo(() => {
    return serviceDesks.filter(d => d.status === 'Active' && !d.isHomeBasedService);
  }, [serviceDesks]);

  // The Location & desks filter should not offer a desk outside the selected
  // region. Keeping this derived means newly added active desks appear here.
  const calendarRegionDesks = useMemo(() => {
    return activeDesksList.filter(desk => calendarRegionFilter === 'ALL' || desk.region === calendarRegionFilter);
  }, [activeDesksList, calendarRegionFilter]);

  const calendarRegionFollowedDeskIds = useMemo(() => {
    return calendarRegionDesks.filter(desk => followedDesks.includes(desk.id)).map(desk => desk.id);
  }, [calendarRegionDesks, followedDesks]);

  const archivedDesksList = useMemo(() => {
    return serviceDesks.filter(d => d.status === 'Archived' && !d.isHomeBasedService);
  }, [serviceDesks]);

  const handlePrepareFullDataDownload = async () => {
    setArchivePreparing(true);
    try {
      // Fetch before the confirmation screen. This lets the actual download
      // begin directly from the user's Confirm click, which avoids browsers
      // treating the eight-file archive as an unsolicited download.
      setPreparedFullArchiveData(await fetchFullRosterArchiveData());
      setConfirmDownloadModalOpen(true);
    } catch (archiveError) {
      alert(`Unable to prepare the complete data archive: ${archiveError.message}`);
    } finally {
      setArchivePreparing(false);
    }
  };

  const handleExecuteFullDataDownload = () => {
    setConfirmDownloadModalOpen(false);

    let archiveAssignments;
    let archiveSlotHolidayOverrides;
    if (!preparedFullArchiveData) {
      alert('The archive data is not ready. Please try Download Data again.');
      return;
    }

    const slotsById = Object.fromEntries(slotTemplates.map(slot => [slot.id, slot]));
    archiveAssignments = preparedFullArchiveData.assignments.reduce((all, assignment) => {
      const slot = slotsById[assignment.slot_id];
      if (!slot) return all;
      const instanceKey = `${slot.deskId}_${slot.id}_${assignment.duty_date}`;
      all[instanceKey] = [...(all[instanceKey] || []), assignment.profile_id];
      return all;
    }, {});
    archiveSlotHolidayOverrides = preparedFullArchiveData.slotHolidayOverrides.map(override => ({
      slotId: override.duty_slot_id,
      date: override.duty_date,
      isHoliday: override.is_holiday
    }));
    setPreparedFullArchiveData(null);

    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;

    const triggerDownload = (fileName, csvContent) => {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const convertToCsv = (arrayData, headers) => {
      if (!arrayData || arrayData.length === 0) {
        return headers.join(',') + '\n';
      }
      const rows = arrayData.map(item => {
        return headers.map(header => {
          const val = item[header] !== undefined && item[header] !== null ? item[header] : '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',');
      });
      return [headers.join(','), ...rows].join('\n');
    };

    triggerDownload(`${timestamp}_1.csv`, convertToCsv(regions, ['id', 'name', 'code']));
    triggerDownload(`${timestamp}_2.csv`, convertToCsv(users, ['id', 'fullName', 'email', 'phone', 'warrantNumber', 'role', 'isProvisional', 'status']));
    triggerDownload(`${timestamp}_3.csv`, convertToCsv(serviceDesks, ['id', 'code', 'name', 'address', 'region', 'primaryAdminId', 'secondaryAdminId', 'siteContactName', 'siteContactEmail', 'contactPerson', 'notes', 'status']));
    triggerDownload(`${timestamp}_4.csv`, convertToCsv(slotTemplates, ['id', 'deskId', 'dayOfWeek', 'startTime', 'endTime', 'minJps', 'targetJps', 'maxJps', 'status', 'effectiveFromDate']));
    
    const assignmentsArray = Object.entries(archiveAssignments).map(([instanceKey, assignedJpIds]) => ({
      instanceKey,
      assignedJpIds: JSON.stringify(assignedJpIds)
    }));
    triggerDownload(`${timestamp}_5.csv`, convertToCsv(assignmentsArray, ['instanceKey', 'assignedJpIds']));
    triggerDownload(`${timestamp}_6.csv`, convertToCsv(loggedStatistics, ['id', 'jpId', 'jpName', 'warrantNumber', 'deskId', 'deskName', 'deskCode', 'region', 'slotId', 'occurrenceKey', 'date', 'startTime', 'endTime', 'noOfJpDuties', 'noOfClients', 'noOfHoursWorked', 'certifiedCopies', 'statutoryDeclarations', 'signatureWitnessed', 'affidavits', 'other', 'notes']));
    triggerDownload(`${timestamp}_7.csv`, convertToCsv(statutoryHolidays, ['id', 'date', 'description']));
    triggerDownload(`${timestamp}_8.csv`, convertToCsv(archiveSlotHolidayOverrides, ['slotId', 'date', 'isHoliday']));
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setShowPassword(false);
    try {
      await signInPortalUser(loginEmail, loginPassword);
      await onSessionChange();
    } catch (error) { setLoginError(error.message); }
  };

  const handleQuickDemoLogin = (role) => {
    if (!demoModeEnabled) return;
    const demoUser = users.find(u => u.role === role && u.status === 'Approved');
    if (demoUser) {
      setCurrentUser(demoUser);
      setIsAuthenticated(true);
      setLoginError('');

      if (demoUser.role === 'Registrar') {
        const pendingCount = users.filter(u => u.status === 'Pending').length;
        if (pendingCount > 0) {
          setPendingMembersNoticeCount(pendingCount);
        } else {
          setActiveTab('calendar');
        }
      } else {
        setActiveTab('calendar');
      }
    }
  };

  const handleDismissPendingNoticeAndGoToRegistrar = () => {
    setPendingMembersNoticeCount(0);
    setActiveTab('registrar');
    setRegistrarSubTab('members');
  };

  const handlePendingApprovalReturnToLogin = async () => {
    try {
      await signOutUser();
    } catch (signOutError) {
      console.warn('Unable to fully sign out pending account:', signOutError.message);
    }
    setPendingApprovalUser(null);
    setLoginPassword('');
    setShowPassword(false);
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setSignUpPasswordError('');
    const fullName = signUpForm.fullName.trim();
    const email = signUpForm.email.trim().toLowerCase();
    const warrantNumber = normaliseWarrantNumber(signUpForm.warrantNumber);
    if (!fullName || !email || !warrantNumber) {
      alert('Please complete your name, email address, and warrant number.');
      return;
    }
    if (signUpForm.password.length < 8) {
      alert('Please use a password of at least 8 characters.');
      return;
    }
    if (signUpForm.password !== signUpForm.confirmPassword) {
      setSignUpPasswordError("Passwords don't match.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password: signUpForm.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName,
          phone: signUpForm.phone.trim(),
          warrant_number: warrantNumber,
          is_provisional: signUpForm.isProvisional
        }
      }
    });
    if (error) {
      if (error.message === 'Database error saving new user') {
        alert('This JP warrant number is already registered. Please check the warrant number for a typing error. If it is correct, contact an AJPA Registrar for assistance.');
      } else {
        alert(`Unable to submit sign-up request: ${error.message}`);
      }
      return;
    }
    setSignUpSuccessMsg({ confirmationExpected: Boolean(data.user && !data.session
      && !data.user.email_confirmed_at && data.user.identities?.length) });
    setSignUpForm(previous => ({ ...previous, password: '', confirmPassword: '' }));
    setSignUpPasswordError('');
  };

  const handleSendResetLink = async (e) => {
    e.preventDefault();
    try {
      await requestPasswordReset(resetEmail, window.location.origin);
    } catch (resetRequestError) {
      alert(`Unable to send reset email: ${resetRequestError.message}`);
      return;
    }
    setResetLinkSent(true);
  };

  const handleSaveNewPassword = async (e) => {
    e.preventDefault();
    setResetError('');

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match. Please re-enter.');
      return;
    }

    if (newPassword.length < 8) {
      setResetError('Password must be at least 8 characters long.');
      return;
    }

    try {
      await updatePassword(newPassword);
    } catch (passwordUpdateError) {
      setResetError(`Unable to update password: ${passwordUpdateError.message}`);
      return;
    }
    alert('Password updated successfully! You can now log in with your new password.');
    setResetScreenOpen(false);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setResetEmail('');
  };

  const handleSignOut = async () => {
    // The normal preference save is deliberately delayed while a user makes a
    // series of changes. Save these filters immediately on sign-out as well,
    // so a quick account switch cannot carry one member's view into another's.
    if (currentUser && preferencesReadyForProfile === currentUser.id) {
      try {
        await saveUserPreferences(currentUser.id, {
          calendar_filters: {
            desk: calendarDeskFilter,
            member_desk_ids: memberCalendarDeskIds,
            region: calendarRegionFilter,
            time_of_day: calendarTimeOfDayFilter,
            days: calendarDayFilter,
            weeks: calendarDisplayWeeks,
            service_desks: {
              view: deskViewFilter,
              regions: selectedDeskRegions
            }
          },
          my_shifts_filters: {
            preset: myShiftsPreset,
            desk: myShiftsDeskFilter,
            from: myShiftsCustomFrom,
            to: myShiftsCustomTo
          },
          desk_maintenance_filters: {
            preset: deskMaintenanceDatePreset,
            desk: deskMaintenanceDeskFilter,
            from: deskMaintenanceCustomFrom,
            to: deskMaintenanceCustomTo
          },
          statistics_filters: {
            region: statsRegionFilter,
            desk: statsDeskFilter,
            jp: statsJpFilter,
            date_preset: statsDatePreset,
            custom_from: customFromDate,
            custom_to: customToDate
          }
        });
      } catch (preferencesSaveError) {
        console.warn('Service Desk filter preferences were not saved before sign-out:', preferencesSaveError.message);
      }
    }
    try {
      await signOutUser();
    } catch (signOutError) {
      console.warn('Unable to fully sign out:', signOutError.message);
    }
    setIsAuthenticated(false);
    setCurrentUser(null);
    setPreferencesReadyForProfile(null);
    setShowUnauthHelp(false);
    setShowPassword(false);
  };

  const handleSaveMyProfile = async (event) => {
    event.preventDefault();
    if (!currentUser) return;

    const email = profileForm.email.trim().toLowerCase();
    const phone = profileForm.phone.trim();
    const warrantNumber = normaliseWarrantNumber(profileForm.warrantNumber);
    const reminderFrequency = isCurrentUserDeskAdmin ? profileForm.reminderFrequency : 'NONE';
    const reminderStartDate = isCurrentUserDeskAdmin && reminderFrequency !== 'NONE' ? profileForm.reminderStartDate : null;
    const reminderWeeks = isCurrentUserDeskAdmin ? Math.max(1, Math.min(52, Number(profileForm.reminderWeeks) || 1)) : 4;
    const calendarWeeks = normaliseCalendarWeeks(profileForm.calendarWeeks);

    if (!email) {
      setProfileSaveError('Please enter an email address.');
      return;
    }
    if (!warrantNumber) {
      setProfileSaveError('Please enter the numeric part of your JP warrant number.');
      return;
    }
    if (isCurrentUserDeskAdmin && reminderFrequency !== 'NONE' && !reminderStartDate) {
      setProfileSaveError('Choose a reminder start date, or select No reminders.');
      return;
    }

    setProfileSaving(true);
    setProfileSaveError('');
    setProfileSaveMessage('');
    try {
      let emailChangePending = false;
      if (email !== currentUser.email.toLowerCase()) {
        const { data, error: authEmailError } = await supabase.auth.updateUser({ email });
        if (authEmailError) throw authEmailError;
        // When Supabase email confirmation is enabled, the old address remains
        // active until the member confirms the message sent to the new one.
        emailChangePending = data.user?.email?.toLowerCase() !== email;
      }

      const { error: profileError } = await supabase.rpc('update_my_profile', {
        p_phone: phone,
        p_warrant_number: warrantNumber,
        p_reminder_frequency: reminderFrequency,
        p_reminder_start_date: reminderStartDate,
        p_reminder_weeks: reminderWeeks
      });
      if (profileError) throw profileError;

      // Calendar length is a personal display preference, so it lives beside
      // the member's existing filter preferences rather than in profiles.
      await saveUserPreferences(currentUser.id, {
        calendar_filters: {
          desk: calendarDeskFilter,
          member_desk_ids: memberCalendarDeskIds,
          region: calendarRegionFilter,
          time_of_day: calendarTimeOfDayFilter,
          days: calendarDayFilter,
          weeks: calendarWeeks
        }
      });

      setCurrentUser(previous => ({
        ...previous,
        email: emailChangePending ? previous.email : email,
        phone,
        warrantNumber,
        reminderFrequency,
        reminderStartDate: reminderStartDate || '',
        reminderWeeks,
        calendarWeeks
      }));
      setCalendarDisplayWeeks(calendarWeeks);
      setUsers(previous => previous.map(user => user.id === currentUser.id ? { ...user, email: emailChangePending ? user.email : email, phone, warrantNumber } : user));
      setProfileForm(previous => ({ ...previous, phone, warrantNumber: warrantNumberDigits(warrantNumber), calendarWeeks, reminderFrequency, reminderStartDate: reminderStartDate || '', reminderWeeks }));
      setProfileSaveMessage(emailChangePending
        ? 'Profile saved. Confirm the email-change message sent to your new address to complete the email update.'
        : 'Your profile has been saved.');
    } catch (profileUpdateError) {
      setProfileSaveError(`Unable to save your profile: ${profileUpdateError.message}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleApprovePendingUser = async (userId) => {
    setLifecycleError('');
    try { await applyMemberLifecycleTransition({ memberId: userId, action: 'APPROVE', expectedStatus: 'Pending' }); await loadSupabaseRoster(currentUser); }
    catch (error) { setLifecycleError(`Unable to approve member: ${error.message}`); await loadSupabaseRoster(currentUser).catch(() => {}); }
  };

  const handleRejectPendingUser = async (userId) => {
    setLifecycleError('');
    try { await applyMemberLifecycleTransition({ memberId: userId, action: 'REJECT', expectedStatus: 'Pending' }); await loadSupabaseRoster(currentUser); }
    catch (error) { setLifecycleError(`Unable to reject member: ${error.message}`); await loadSupabaseRoster(currentUser).catch(() => {}); }
  };

  const validateSlotForm = (form) => {
    const { startTime, endTime, minJps, targetJps, maxJps } = form;

    if (!startTime || !endTime) {
      return 'Both Start Time and End Time are required.';
    }

    if (startTime >= endTime) {
      return 'Start Time must be strictly earlier than End Time.';
    }

    if (isNaN(minJps) || minJps < 1) {
      return 'Minimum JPs must be at least 1.';
    }

    if (isNaN(targetJps) || isNaN(maxJps)) {
      return 'Target JPs and Max JPs must be valid numeric values.';
    }

    if (minJps > targetJps) {
      return `Minimum JPs (${minJps}) cannot exceed Target JPs (${targetJps}). Rule: Min JPs ≤ Target JPs ≤ Max JPs.`;
    }

    if (targetJps > maxJps) {
      return `Target JPs (${targetJps}) cannot exceed Max JPs Capacity (${maxJps}). Rule: Min JPs ≤ Target JPs ≤ Max JPs.`;
    }

    return null;
  };

  const activeSlotValidationError = useMemo(() => {
    return validateSlotForm(slotForm);
  }, [slotForm]);

  const handleOpenAddSlotModal = (targetDeskId = null) => {
    if (!canManage || (targetDeskId && !canMaintainDesk(targetDeskId))) return;
    setEditingSlotId(null);
    setSlotValidationError('');
    setSlotForm({
      deskId: targetDeskId || (currentUser?.role === 'Admin' ? serviceDesks.find(desk => canMaintainDesk(desk))?.id : activeDesksList[0]?.id) || 'desk-remuera',
      dayOfWeek: 'Tuesday',
      startTime: '10:00',
      endTime: '12:00',
      minJps: 1,
      targetJps: 1,
      maxJps: 2,
      status: 'Active',
      effectiveFromDate: '2026-09-01'
    });
    setSlotModalOpen(true);
  };

  const handleOpenEditSlotModal = (slot) => {
    if (!canMaintainDesk(slot.deskId)) return;
    setEditingSlotId(slot.id);
    setSlotValidationError('');
    setSlotForm({
      deskId: slot.deskId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      minJps: slot.minJps,
      targetJps: slot.targetJps,
      maxJps: slot.maxJps,
      status: slot.status,
      effectiveFromDate: slot.effectiveFromDate || '2026-09-01'
    });
    setSlotModalOpen(true);
  };

  const handlePromptSaveSlot = (e) => {
    e.preventDefault();
    if (!canManage || !canMaintainDesk(slotForm.deskId)) return;
    const errorMsg = validateSlotForm(slotForm);
    if (errorMsg) {
      setSlotValidationError(errorMsg);
      return;
    }
    setSlotValidationError('');
    setSlotActionConfirm('SAVE');
  };

  const handlePromptCancelSlot = () => {
    setSlotActionConfirm('CANCEL');
  };

  const handlePromptDeleteSlot = () => {
    if (!canManage) return;
    setSlotActionConfirm('DELETE');
  };

  const handleConfirmSlotAction = async () => {
    if ((!canManage || !canMaintainDesk(slotForm.deskId)) && slotActionConfirm !== 'CANCEL') {
      setSlotActionConfirm(null);
      return;
    }
    if (slotActionConfirm === 'SAVE') {
      const payload = { desk_id: slotForm.deskId, day_of_week: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(slotForm.dayOfWeek), start_time: slotForm.startTime, end_time: slotForm.endTime, min_jps: Number(slotForm.minJps), target_jps: Number(slotForm.targetJps), max_jps: Number(slotForm.maxJps), status: slotForm.status, effective_from: slotForm.effectiveFromDate };
      const result = editingSlotId ? await supabase.from('duty_slots').update(payload).eq('id', editingSlotId) : await supabase.from('duty_slots').insert(payload);
      if (result.error) { alert(`Unable to save duty slot: ${result.error.message}`); return; }
      await loadSupabaseRoster(currentUser);
      setSlotModalOpen(false);
      setSlotActionConfirm(null);
      setSlotValidationError('');
      return;
    } else if (slotActionConfirm === 'CANCEL') {
      setSlotModalOpen(false);
    } else if (slotActionConfirm === 'DELETE') {
      if (editingSlotId) {
        const { error } = await supabase.from('duty_slots').update({ status: 'Archived' }).eq('id', editingSlotId);
        if (error) { alert(`Unable to archive duty slot: ${error.message}`); return; }
        await loadSupabaseRoster(currentUser);
      }
      setSlotModalOpen(false);
    }
    setSlotActionConfirm(null);
    setSlotValidationError('');
  };

  const confirmDeleteSlot = async () => {
    if (!canManage) return;
    const { error } = await supabase.from('duty_slots').update({ status: 'Archived' }).eq('id', pendingDeleteSlotId);
    if (error) { alert(`Unable to archive duty slot: ${error.message}`); return; }
    await loadSupabaseRoster(currentUser);
    setPendingDeleteSlotId(null);
  };

  const handleSaveStatutoryHoliday = async (event) => {
    event.preventDefault();
    if (!holidayForm.date || !holidayForm.description.trim()) {
      alert('Enter both the statutory holiday date and a description.');
      return;
    }

    const payload = { holiday_date: holidayForm.date, description: holidayForm.description.trim() };
    const result = editingStatutoryHolidayId
      ? await supabase.from('statutory_holidays').update(payload).eq('id', editingStatutoryHolidayId)
      : await supabase.from('statutory_holidays').insert(payload);

    if (result.error) {
      alert(`Unable to save statutory holiday: ${result.error.message}`);
      return;
    }

    await loadSupabaseRoster(currentUser);
    setHolidayForm({ date: '', description: '' });
    setEditingStatutoryHolidayId(null);
  };

  const handleEditStatutoryHoliday = (holiday) => {
    setHolidayForm({ date: holiday.date, description: holiday.description });
    setEditingStatutoryHolidayId(holiday.id);
  };

  const handleDeleteStatutoryHoliday = async (holiday) => {
    if (!window.confirm(`Delete ${holiday.description} on ${holiday.date}? Existing desk-specific Holiday overrides will be retained.`)) return;
    const { error } = await supabase.from('statutory_holidays').delete().eq('id', holiday.id);
    if (error) {
      alert(`Unable to delete statutory holiday: ${error.message}`);
      return;
    }
    await loadSupabaseRoster(currentUser);
    if (editingStatutoryHolidayId === holiday.id) {
      setHolidayForm({ date: '', description: '' });
      setEditingStatutoryHolidayId(null);
    }
  };

  const handleSetOccurrenceHoliday = async (occurrence, isHoliday) => {
    if (!canManageHolidayForDesk(occurrence.deskId)) return;

    const isStatutoryHoliday = Boolean(statutoryHolidayByDate[occurrence.date]);
    const overrideKey = `${occurrence.slotId}_${occurrence.date}`;
    const hasOverride = Object.prototype.hasOwnProperty.call(slotHolidayOverrideByKey, overrideKey);
    let error;

    // Matching the statutory default needs no stored exception. This keeps the
    // statutory-holiday list as the source of truth while preserving deliberate
    // desk-level reopenings (Holiday = false).
    if (isHoliday === isStatutoryHoliday) {
      if (hasOverride) ({ error } = await supabase.from('duty_slot_holiday_overrides').delete().eq('duty_slot_id', occurrence.slotId).eq('duty_date', occurrence.date));
    } else {
      ({ error } = await supabase.from('duty_slot_holiday_overrides').upsert({
        duty_slot_id: occurrence.slotId,
        duty_date: occurrence.date,
        is_holiday: isHoliday,
      }, { onConflict: 'duty_slot_id,duty_date' }));
    }

    if (error) {
      alert(`Unable to update the Holiday setting: ${error.message}`);
      return;
    }

    await loadSupabaseRoster(currentUser);
    setDetailedSlotModal(current => current ? {
      ...current,
      isHoliday,
      holidayDescription: isStatutoryHoliday ? statutoryHolidayByDate[occurrence.date].description : '',
    } : null);
  };

  const statisticsDateWindow = useMemo(() => (
    getStatisticsDateWindow(statsDatePreset, customFromDate, customToDate)
  ), [statsDatePreset, customFromDate, customToDate]);

  const filteredStatisticsList = useMemo(() => {
    if (!currentUser) return [];

    return loggedStatistics.filter(stat => {
      if (currentUser.role === 'Member' && stat.jpId !== currentUser.id) {
        return false;
      }

      if (currentUser.role !== 'Member' && statsJpFilter !== 'ALL' && stat.jpId !== statsJpFilter) {
        return false;
      }

      if (statsRegionFilter !== 'ALL' && stat.region !== statsRegionFilter) {
        return false;
      }

      if (statsDeskFilter !== 'ALL' && stat.deskId !== statsDeskFilter) {
        return false;
      }

      if (stat.date < statisticsDateWindow.startDate || stat.date > statisticsDateWindow.endDate) return false;

      return true;
    });
  }, [loggedStatistics, currentUser, statsRegionFilter, statsDeskFilter, statsJpFilter, statisticsDateWindow]);

  const handleDownloadCsv = () => {
    if (filteredStatisticsList.length === 0) {
      alert('No statistics available to export for the selected filter range.');
      return;
    }

    const headers = [
      'Log ID', 'Date', 'Start Time', 'End Time', 'Region', 
      'Service Desk', 'Desk Code', 'Slot ID', 'Occurrence Key', 'JP Name', 'Warrant Number', 
      'JP Duties', 'Clients Served', 'Hours Worked', 
      'Certified Copies', 'Statutory Declarations', 'Signatures Witnessed', 
      'Affidavits', 'Other Duties', 'Notes'
    ];

    const rows = filteredStatisticsList.map(s => [
      `"${s.id}"`, `"${s.date}"`, `"${s.startTime}"`, `"${s.endTime}"`, `"${s.region}"`,
      `"${s.deskName}"`, `"${s.deskCode}"`, `"${s.slotId || ''}"`, `"${s.occurrenceKey || ''}"`, `"${s.jpName}"`, `"${s.warrantNumber}"`,
      s.noOfJpDuties, s.noOfClients, s.noOfHoursWorked,
      s.certifiedCopies, s.statutoryDeclarations, s.signatureWitnessed,
      s.affidavits, s.other, `"${(s.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `JP_Service_Desk_Statistics_${statsDatePreset}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadActivityLogCsv = () => {
    if (rosterActivityAudit.length === 0) {
      alert('There is no Activity Log data available to export.');
      return;
    }

    const csvCell = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      // Prevent spreadsheet applications from interpreting an audit value as a formula.
      const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };

    const actionLabel = (activity) => formatActivityAction(activity);

    const rows = rosterActivityAudit.map((activity) => {
      const actor = userMap[activity.actorProfileId];
      const subject = userMap[activity.subjectProfileId];
      const account = activity.actorProfileId
        ? actor?.fullName || 'Unavailable account'
        : 'Automated recurring roster process';

      const ruleDetail = formatActivityRuleDetail(activity);

      const occurredAtAuckland = activity.occurredAt
        ? new Date(activity.occurredAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' })
        : '';

      return [
        activity.id,
        activity.occurredAt || '',
        occurredAtAuckland,
        account,
        activity.actorProfileId || '',
        actionLabel(activity),
        subject?.fullName || 'Deleted or unavailable profile',
        activity.subjectProfileId || '',
        activity.deskCode || '',
        activity.deskName || '',
        activity.dutyDate || activity.ruleStartDate || '',
        activity.startTime || '',
        activity.endTime || '',
        activity.ruleAction || '',
        activity.ruleType || '',
        activity.ruleCount || '',
        activity.ruleStartDate || '',
        activity.ruleUntilDate || '',
        ruleDetail
      ].map(csvCell).join(',');
    });

    const headers = [
      'Activity ID', 'Occurred At (UTC)', 'Occurred At (Auckland)', 'Account', 'Account ID',
      'Action', 'JP Affected', 'JP Affected ID', 'Desk Code', 'Service Desk', 'Duty / Rule Date',
      'Start Time', 'End Time', 'Rule Action', 'Rule Type', 'Rule Count', 'Rule Start Date',
      'Rule Until Date', 'Rule Detail'
    ];
    const blob = new Blob([[headers.map(csvCell).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const downloadTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const downloadUrl = URL.createObjectURL(blob);
    link.href = downloadUrl;
    link.setAttribute('download', `AJPA_Roster_Activity_Log_${downloadTimestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Let the browser begin the download before releasing the temporary URL.
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
  };

  const refreshActivityLog = async ({ range = activityLogRange, fromDate = activityLogCustomFrom, toDate = activityLogCustomTo } = {}) => {
    const request = range === 'LAST_1000'
      ? { limit: 1000 }
      : range === 'DATE_RANGE'
        ? { limit: 1000, fromDate, toDate }
        : { limit: 250 };

    setActivityLogLoading(true);
    try {
      setRosterActivityAudit(await fetchRosterActivityAudit(request));
      setRosterActivityAuditError('');
    } catch (auditError) {
      console.warn('Unable to refresh the Activity Log:', auditError.message);
      setRosterActivityAudit([]);
      setRosterActivityAuditError(auditError.message);
    } finally {
      setActivityLogLoading(false);
    }
  };

  const handleActivityLogRangeChange = async (range) => {
    if (range === 'DATE_RANGE') {
      setActivityLogCustomModalOpen(true);
      return;
    }

    setActivityLogRange(range);
    await refreshActivityLog({ range });
  };

  const handleApplyActivityLogDateRange = async ({ fromDate, toDate }) => {
    setActivityLogCustomFrom(fromDate);
    setActivityLogCustomTo(toDate);
    setActivityLogRange('DATE_RANGE');
    setActivityLogCustomModalOpen(false);
    await refreshActivityLog({ range: 'DATE_RANGE', fromDate, toDate });
  };

  const handleOpenEditStatModal = (statRecord) => {
    setEditingStatRecord(statRecord);
    setEditStatForm({
      dutyDate: statRecord.date,
      startTime: statRecord.startTime || '09:00',
      noOfJpDuties: calculateJpDuties(statRecord.noOfHoursWorked),
      noOfClients: statRecord.noOfClients,
      noOfHoursWorked: statRecord.noOfHoursWorked,
      certifiedCopies: statRecord.certifiedCopies,
      statutoryDeclarations: statRecord.statutoryDeclarations,
      signatureWitnessed: statRecord.signatureWitnessed,
      affidavits: statRecord.affidavits,
      other: statRecord.other,
      notes: statRecord.notes || ''
    });
  };

  const handleEditStatInputChange = (field, value, isFloat = false) => {
    if (isFloat) {
      const val = parseFloat(value);
      const cleanValue = isNaN(val) || val < 0 ? 0 : val;
      setEditStatForm(prev => ({
        ...prev,
        [field]: cleanValue,
        ...(field === 'noOfHoursWorked' ? { noOfJpDuties: calculateJpDuties(cleanValue) } : {})
      }));
    } else {
      const val = parseInt(value, 10);
      setEditStatForm(prev => ({ ...prev, [field]: isNaN(val) || val < 0 ? 0 : val }));
    }
  };

  const handleSaveEditedStatSubmit = async (e) => {
    e.preventDefault();
    if (!editingStatRecord) return;
    const statisticValues = {
      noOfClients: editStatForm.noOfClients,
      noOfHoursWorked: editStatForm.noOfHoursWorked,
      certifiedCopies: editStatForm.certifiedCopies,
      statutoryDeclarations: editStatForm.statutoryDeclarations,
      signatureWitnessed: editStatForm.signatureWitnessed,
      affidavits: editStatForm.affidavits,
      other: editStatForm.other,
      notes: editStatForm.notes
    };
    if (editingStatRecord.isHomeBasedService) {
      const { error } = await supabase.rpc('save_home_based_duty_statistic', {
        p_statistic_id: editingStatRecord.id,
        p_duty_date: editStatForm.dutyDate,
        p_start_time: editStatForm.startTime,
        p_values: statisticValues
      });
      if (error) { alert(`Unable to save Home Based Service statistics: ${error.message}`); return; }
      await loadSupabaseRoster(currentUser);
      setEditingStatRecord(null);
      setStatsSuccessToast(true);
      setTimeout(() => setStatsSuccessToast(false), 3000);
      return;
    }
    const { error } = await supabase.rpc('save_duty_statistic_for_member', {
      p_statistic_id: editingStatRecord.id,
      p_member_id: editingStatRecord.jpId,
      p_slot_id: editingStatRecord.slotId,
      p_duty_date: editingStatRecord.date,
      p_values: statisticValues
    });
    if (error) { alert(`Unable to save statistics: ${error.message}`); return; }
    await loadSupabaseRoster(currentUser);

    setEditingStatRecord(null);
    setStatsSuccessToast(true);
    setTimeout(() => setStatsSuccessToast(false), 3000);
  };

  const confirmDeleteStatRecord = async () => {
    if (!confirmDeleteStatId) return;
    const { error } = await supabase.rpc('delete_duty_statistic_for_member', { p_statistic_id: confirmDeleteStatId });
    if (error) { alert(`Unable to delete statistics: ${error.message}`); return; }
    await loadSupabaseRoster(currentUser);
    setConfirmDeleteStatId(null);
    setEditingStatRecord(null);
  };

  const groupedServiceDesks = useMemo(() => {
    const list = deskViewFilter === 'Active' ? activeDesksList : archivedDesksList;
    const filteredByRegion = list.filter(d => selectedDeskRegions.includes(d.region));

    const grouped = {};
    regions.forEach(r => {
      if (selectedDeskRegions.includes(r.name)) {
        grouped[r.name] = [];
      }
    });

    filteredByRegion.forEach(desk => {
      if (!grouped[desk.region]) {
        grouped[desk.region] = [];
      }
      grouped[desk.region].push(desk);
    });

    Object.keys(grouped).forEach(regionName => {
      grouped[regionName].sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  }, [deskViewFilter, activeDesksList, archivedDesksList, selectedDeskRegions, regions]);

  // Keep an already-open calendar aligned with the new week at local Monday
  // midnight. The timer is then re-scheduled for the following Monday.
  useEffect(() => {
    let rolloverTimer;

    const scheduleWeeklyRollover = () => {
      const now = new Date();
      const nextMonday = getNextMondayMidnight(now);

      rolloverTimer = window.setTimeout(() => {
        setCalendarNow(new Date());
        scheduleWeeklyRollover();
      }, Math.max(1000, nextMonday.getTime() - now.getTime()));
    };

    scheduleWeeklyRollover();
    return () => window.clearTimeout(rolloverTimer);
  }, []);

  // CALENDAR ROLLOVER AT MIDNIGHT SUNDAY NIGHT
  const currentWeek1Monday = useMemo(() => {
    // Use the date on the member's device rather than the former demo date.
    // Week 1 always begins on the Monday of the current local week.
    return getWeekStartMonday();
  }, [calendarNow]);

  const rollingCalendarWeeks = useMemo(() => {
    const weeks = [];
    const dayNameMap = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 0: 'Sunday' };
    const baseMonday = new Date(currentWeek1Monday);

    for (let w = 0; w < calendarDisplayWeeks; w++) {
      const weekStart = new Date(baseMonday);
      weekStart.setDate(baseMonday.getDate() + (w * 7));

      const days = [];
      for (let d = 0; d < 7; d++) {
        const currentDate = new Date(weekStart);
        currentDate.setDate(weekStart.getDate() + d);

        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const isoDate = `${year}-${month}-${day}`;
        const dayOfWeekName = dayNameMap[currentDate.getDay()];

        days.push({
          dayName: dayOfWeekName.substring(0, 3),
          fullDayName: dayOfWeekName,
          isoDate,
          formattedDate: `${day}-${month}-${year}`
        });
      }

      weeks.push({
        weekIndex: w,
        weekNumber: w + 1,
        startDate: days[0].formattedDate,
        endDate: days[6].formattedDate,
        days
      });
    }
    return weeks;
  }, [calendarDisplayWeeks, currentWeek1Monday]);

  const statutoryHolidayByDate = useMemo(() => {
    return statutoryHolidays.reduce((byDate, holiday) => {
      byDate[holiday.date] = holiday;
      return byDate;
    }, {});
  }, [statutoryHolidays]);

  const slotHolidayOverrideByKey = useMemo(() => {
    return slotHolidayOverrides.reduce((byKey, override) => {
      byKey[`${override.slotId}_${override.date}`] = override.isHoliday;
      return byKey;
    }, {});
  }, [slotHolidayOverrides]);

  const canManageHolidayForDesk = (_deskId) => {
    if (!currentUser) return false;
    return currentUser.role === 'Registrar' || currentUser.role === 'Admin';
  };

  // GENERATE EXTENDED OCCURRENCES ACROSS ALL TIME RANGES
  const generatedOccurrences = useMemo(() => {
    const instances = [];
    const dayNameMap = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 0: 'Sunday' };

    const rangeStart = new Date(currentWeek1Monday);
    rangeStart.setDate(rangeStart.getDate() - 90);

    const rangeEnd = new Date(currentWeek1Monday);
    rangeEnd.setDate(rangeEnd.getDate() + 270);

    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const isoDate = `${year}-${month}-${day}`;
      const fullDayName = dayNameMap[d.getDay()];
      const dayName = fullDayName.substring(0, 3);
      const formattedDate = `${day}-${month}-${year}`;

      slotTemplates.forEach(template => {
        const parentDesk = activeDeskMap[template.deskId];
        if (!parentDesk || parentDesk.status !== 'Active' || parentDesk.isHomeBasedService) return;

        if (template.status === 'Active' && template.dayOfWeek === fullDayName) {
          const instanceKey = `${template.deskId}_${template.id}_${isoDate}`;
          const overrideKey = `${template.id}_${isoDate}`;
          const statutoryHoliday = statutoryHolidayByDate[isoDate];
          const isHoliday = Object.prototype.hasOwnProperty.call(slotHolidayOverrideByKey, overrideKey)
            ? slotHolidayOverrideByKey[overrideKey]
            : Boolean(statutoryHoliday);

          if (!cancelledSlotInstances.includes(instanceKey)) {
            let assignedJpIds = [...(slotAssignments[instanceKey] || [])];

            instances.push({
              instanceKey,
              slotId: template.id,
              deskId: template.deskId,
              date: isoDate,
              formattedDate,
              dayName,
              fullDayName,
              startTime: template.startTime,
              endTime: template.endTime,
              minJps: template.minJps,
              targetJps: template.targetJps,
              maxJps: template.maxJps,
              timeZone: parentDesk.timeZone || DEFAULT_ROSTER_TIME_ZONE,
              assignedJpIds,
              isHoliday,
              holidayDescription: statutoryHoliday?.description || ''
            });
          }
        }
      });
    }

    return instances;
  }, [currentWeek1Monday, slotTemplates, cancelledSlotInstances, slotAssignments, activeDeskMap, statutoryHolidayByDate, slotHolidayOverrideByKey]);

  const deskMaintenanceDeskIds = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Registrar') return activeDesksList.map(desk => desk.id);
    return activeDesksList
      .filter(desk => desk.primaryAdminId === currentUser.id || desk.secondaryAdminId === currentUser.id)
      .map(desk => desk.id);
  }, [currentUser, activeDesksList]);

  const deskMaintenanceDesks = useMemo(() => activeDesksList
    .filter(desk => deskMaintenanceDeskIds.includes(desk.id))
    .sort((first, second) => first.name.localeCompare(second.name)), [activeDesksList, deskMaintenanceDeskIds]);

  useEffect(() => {
    if (deskMaintenanceDeskFilter !== 'ALL' && !deskMaintenanceDesks.some(desk => desk.id === deskMaintenanceDeskFilter)) {
      setDeskMaintenanceDeskFilter('ALL');
    }
  }, [deskMaintenanceDeskFilter, deskMaintenanceDesks]);

  useEffect(() => {
    if (activeTab !== 'desk-maintenance' || deskMaintenanceSubTab !== 'jp-contacts' || !canUseDeskMaintenance) return undefined;

    let cancelled = false;
    setDeskMaintenanceContactsLoading(true);
    fetchDeskFollowerContacts(deskMaintenanceDeskFilter === 'ALL' ? null : deskMaintenanceDeskFilter)
      .then(contacts => {
        if (cancelled) return;
        setDeskMaintenanceContacts(contacts);
        setDeskMaintenanceContactsError('');
      })
      .catch(error => {
        if (cancelled) return;
        setDeskMaintenanceContacts([]);
        setDeskMaintenanceContactsError(error.message);
      })
      .finally(() => {
        if (!cancelled) setDeskMaintenanceContactsLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, deskMaintenanceSubTab, deskMaintenanceDeskFilter, canUseDeskMaintenance, currentUser?.id]);

  const deskMaintenanceDateFilterDescriptor = useMemo(() => getShiftDateRangeDescriptor({
    preset: deskMaintenanceDatePreset,
    currentWeek1Monday,
    fromDate: deskMaintenanceCustomFrom,
    toDate: deskMaintenanceCustomTo,
    subject: 'Desk Maintenance shifts'
  }), [deskMaintenanceDatePreset, currentWeek1Monday, deskMaintenanceCustomFrom, deskMaintenanceCustomTo]);

  const deskMaintenanceOccurrences = useMemo(() => {
    return generatedOccurrences
      .filter(occ => deskMaintenanceDeskIds.includes(occ.deskId))
      .filter(occ => deskMaintenanceDeskFilter === 'ALL' || occ.deskId === deskMaintenanceDeskFilter)
      .filter(occ => occ.date >= deskMaintenanceDateFilterDescriptor.startDateStr && occ.date <= deskMaintenanceDateFilterDescriptor.endDateStr)
      .sort((first, second) => first.date.localeCompare(second.date)
        || first.startTime.localeCompare(second.startTime)
        || (activeDeskMap[first.deskId]?.name || '').localeCompare(activeDeskMap[second.deskId]?.name || ''));
  }, [generatedOccurrences, deskMaintenanceDeskIds, deskMaintenanceDeskFilter, deskMaintenanceDateFilterDescriptor, activeDeskMap]);

  const activeMembersForDeskMaintenance = useMemo(() => users
    .filter(user => user.isApproved)
    .sort((first, second) => first.fullName.localeCompare(second.fullName)), [users]);

  const handleStaffAssignmentChange = async (occurrence, memberId, action) => {
    if (!memberId) {
      alert('Select a JP member first.');
      return;
    }
    const member = userMap[memberId];
    const verb = action === 'REGISTER' ? 'register' : 'withdraw';
    if (!window.confirm(`Do you want to ${verb} ${member?.fullName || 'this JP member'} ${action === 'REGISTER' ? 'for' : 'from'} the selected shift?`)) return;
    const { error } = await supabase.rpc('apply_duty_assignment_change_for_member', {
      p_member_id: memberId,
      p_action: action,
      p_slot_id: occurrence.slotId,
      p_duty_date: occurrence.date
    });
    if (error) { alert(`Unable to ${verb} JP member: ${error.message}`); return; }

    // Reloading roster data also reloads saved display preferences. Preserve
    // the filters the Desk Admin is using right now, including changes made
    // less than the short preference-save delay ago.
    const activeFilters = {
      datePreset: deskMaintenanceDatePreset,
      desk: deskMaintenanceDeskFilter,
      from: deskMaintenanceCustomFrom,
      to: deskMaintenanceCustomTo
    };
    await loadSupabaseRoster(currentUser);
    setDeskMaintenanceDatePreset(activeFilters.datePreset);
    setDeskMaintenanceDeskFilter(activeFilters.desk);
    setDeskMaintenanceCustomFrom(activeFilters.from);
    setDeskMaintenanceCustomTo(activeFilters.to);
    await refreshActivityLog();
  };

  // MY SHIFTS DATE RANGE & COMPUTED FILTERED LIST
  const myShiftsFilterDescriptor = useMemo(() => {
    const today = calendarDateFromIso(getTimeZoneDateString());
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const formatDateStr = (d) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    if (myShiftsPreset === 'DEFAULT_13_WEEKS') {
      const start = new Date(currentWeek1Monday);
      start.setDate(start.getDate() - 7);
      const end = new Date(currentWeek1Monday);
      end.setDate(end.getDate() + (84 - 1));
      return {
        label: `Showing my shifts for 13-week window: Prior Week + Calendar Weeks 1-12 (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: calendarDateToIso(start),
        endDateStr: calendarDateToIso(end)
      };
    }
    else if (myShiftsPreset === 'DEFAULT_5WEEKS') {
      const start = new Date(currentWeek1Monday);
      start.setDate(start.getDate() - 7);
      const end = new Date(currentWeek1Monday);
      end.setDate(end.getDate() + (28 + 6));
      return {
        label: `Showing my shifts for 5-week window: Prior Week + Calendar Weeks 1-4 (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: calendarDateToIso(start),
        endDateStr: calendarDateToIso(end)
      };
    } 
    else if (myShiftsPreset === 'NEXT_4_WEEKS') {
      const start = new Date(currentWeek1Monday);
      const end = new Date(currentWeek1Monday);
      end.setDate(end.getDate() + (28 - 1));
      return {
        label: `Showing my shifts for Calendar Weeks 1-4 (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: calendarDateToIso(start),
        endDateStr: calendarDateToIso(end)
      };
    }
    else if (myShiftsPreset === 'THIS_MONTH') {
      const start = new Date(currentYear, currentMonth, 1);
      const end = new Date(currentYear, currentMonth + 1, 0);
      return {
        label: `Showing my shifts for This Month (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: calendarDateToIso(start),
        endDateStr: calendarDateToIso(end)
      };
    } 
    else if (myShiftsPreset === 'LAST_MONTH') {
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const start = new Date(prevYear, prevMonth, 1);
      const end = new Date(prevYear, prevMonth + 1, 0);
      return {
        label: `Showing my shifts for Last Month (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: calendarDateToIso(start),
        endDateStr: calendarDateToIso(end)
      };
    } 
    else if (myShiftsPreset === 'NEXT_MONTH') {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const start = new Date(nextYear, nextMonth, 1);
      const end = new Date(nextYear, nextMonth + 1, 0);
      return {
        label: `Showing my shifts for Next Month (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: calendarDateToIso(start),
        endDateStr: calendarDateToIso(end)
      };
    } 
    else if (myShiftsPreset === 'CUSTOM') {
      const start = calendarDateFromIso(myShiftsCustomFrom);
      const end = calendarDateFromIso(myShiftsCustomTo);
      return {
        label: `Showing my shifts for Custom Date Range (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: myShiftsCustomFrom,
        endDateStr: myShiftsCustomTo
      };
    }

    return { label: 'Showing registered shifts', startDateStr: '1970-01-01', endDateStr: '2099-12-31' };
  }, [myShiftsPreset, currentWeek1Monday, myShiftsCustomFrom, myShiftsCustomTo]);

  // The visible Statistics period is the primary driver.  We also retain the
  // selected My Shifts period, plus the four-week Desk Maintenance view for
  // staff, so a completed shift never incorrectly appears as missing just
  // because its statistics were outside the report currently on screen.
  const statisticsReadWindow = useMemo(() => {
    const today = getTimeZoneDateString();
    const startDates = [statisticsDateWindow.startDate, myShiftsFilterDescriptor.startDateStr];
    if (isCurrentUserDeskAdmin) startDates.push(addDaysToIsoDate(today, -28));

    return {
      startDate: startDates.reduce((earliest, candidate) => candidate < earliest ? candidate : earliest),
      endDate: [statisticsDateWindow.endDate, myShiftsFilterDescriptor.endDateStr, today]
        .reduce((latest, candidate) => candidate > latest ? candidate : latest)
    };
  }, [statisticsDateWindow, myShiftsFilterDescriptor, isCurrentUserDeskAdmin]);

  useEffect(() => {
    if (!currentUser || preferencesReadyForProfile !== currentUser.id) return undefined;

    let cancelled = false;
    const refreshStatisticsWindow = async () => {
      try {
        const statistics = await fetchStatisticsForWindow({
          ...statisticsReadWindow,
          users,
          desks: serviceDesks,
          slots: slotTemplates
        });
        if (!cancelled) setLoggedStatistics(statistics);
      } catch (statisticsError) {
        // Keep the last successfully loaded window on screen if a temporary
        // network issue occurs. The rest of the roster remains usable.
        console.warn('Statistics window could not be refreshed:', statisticsError.message);
      }
    };

    refreshStatisticsWindow();
    return () => { cancelled = true; };
  }, [
    currentUser,
    preferencesReadyForProfile,
    statisticsReadWindow,
    users,
    serviceDesks,
    slotTemplates
  ]);

  const myShiftsFilteredList = useMemo(() => {
    if (!currentUser) return [];

    return generatedOccurrences.filter(occ => {
      if (!occ.assignedJpIds.includes(currentUser.id)) return false;
      if (myShiftsDeskFilter !== 'ALL' && occ.deskId !== myShiftsDeskFilter) return false;
      return occ.date >= myShiftsFilterDescriptor.startDateStr && occ.date <= myShiftsFilterDescriptor.endDateStr;
    }).sort((first, second) => (
      first.date.localeCompare(second.date)
      || first.startTime.localeCompare(second.startTime)
      || first.endTime.localeCompare(second.endTime)
      || first.deskName.localeCompare(second.deskName)
    ));
  }, [generatedOccurrences, currentUser, myShiftsFilterDescriptor, myShiftsDeskFilter]);

  const loggedStatisticKeys = useMemo(() => new Set(
    loggedStatistics.map(stat => `${stat.jpId}:${stat.slotId}:${stat.date}`)
  ), [loggedStatistics]);

  const hasLoggedStatisticsForOccurrence = (occurrence, profileId = currentUser?.id) => (
    Boolean(profileId) && loggedStatisticKeys.has(`${profileId}:${occurrence.slotId}:${occurrence.date}`)
  );

  const isOccurrenceFinished = (occurrence) => hasShiftEnded(occurrence, actionClock);

  // JP Stats deliberately keeps its original behaviour: the recent view is
  // the last four weeks of completed shifts, while Incomplete covers every
  // older missing record.  The Assign JPs date filter does not narrow either.
  const deskMaintenanceStatisticsOccurrences = useMemo(() => {
    const earliest = addDaysToIsoDate(getTimeZoneDateString(), -28);
    return generatedOccurrences
      .filter(occ => deskMaintenanceDeskIds.includes(occ.deskId))
      .filter(occ => deskMaintenanceDeskFilter === 'ALL' || occ.deskId === deskMaintenanceDeskFilter)
      .filter(occ => occ.date >= earliest)
      .sort((first, second) => first.date.localeCompare(second.date)
        || first.startTime.localeCompare(second.startTime)
        || (activeDeskMap[first.deskId]?.name || '').localeCompare(activeDeskMap[second.deskId]?.name || ''));
  }, [generatedOccurrences, deskMaintenanceDeskIds, deskMaintenanceDeskFilter, activeDeskMap]);

  const deskMaintenanceRecentStatisticRows = useMemo(() => deskMaintenanceStatisticsOccurrences
    .filter(occ => isOccurrenceFinished(occ))
    .flatMap(occ => occ.assignedJpIds.map(memberId => ({ occ, memberId }))), [deskMaintenanceStatisticsOccurrences, actionClock]);

  const deskMaintenanceIncompleteStatisticRows = useMemo(() => incompleteDutyStatistics
    .filter(item => deskMaintenanceDeskFilter === 'ALL' || item.deskId === deskMaintenanceDeskFilter)
    .map(item => ({
      occ: {
        deskId: item.deskId,
        slotId: item.slotId,
        date: item.dutyDate,
        startTime: item.startTime,
        endTime: item.endTime,
        instanceKey: `${item.deskId}_${item.slotId}_${item.dutyDate}`
      },
      memberId: item.memberId,
      memberName: item.memberName,
      warrantNumber: item.warrantNumber,
      deskName: item.deskName,
      deskCode: item.deskCode
    })), [incompleteDutyStatistics, deskMaintenanceDeskFilter]);

  const handleOpenLogStatsModal = (occ, e, subjectUser = currentUser) => {
    if (e) e.stopPropagation();
    if (!isOccurrenceFinished(occ)) {
      alert('Statistics can be logged after this shift has ended.');
      return;
    }
    if (!subjectUser) return;
    if (hasLoggedStatisticsForOccurrence(occ, subjectUser.id)) {
      alert('Statistics have already been logged for this shift. To maintain them, open the Statistics tab.');
      return;
    }
    setLogStatsOccurrence(occ);
    setStatisticsSubjectUser(subjectUser);

    let defaultHours = 2.00;
    try {
      const [startH, startM] = occ.startTime.split(':').map(Number);
      const [endH, endM] = occ.endTime.split(':').map(Number);
      const diff = (endH * 60 + endM) - (startH * 60 + startM);
      if (diff > 0) defaultHours = parseFloat((diff / 60).toFixed(2));
    } catch {}

    setStatsForm({
      noOfJpDuties: calculateJpDuties(defaultHours),
      noOfClients: 0,
      noOfHoursWorked: defaultHours,
      certifiedCopies: 0,
      statutoryDeclarations: 0,
      signatureWitnessed: 0,
      affidavits: 0,
      other: 0,
      notes: ''
    });
  };

  useEffect(() => {
    if (!statisticsReminderToken || statisticsReminderOpening.current || !currentUser || !isAuthenticated || !slotTemplates.length || !serviceDesks.length) return undefined;

    let cancelled = false;
    const clearReminderFromAddress = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('statsReminder');
      window.history.replaceState(window.history.state, '', url.toString());
    };

    const openReminder = async () => {
      statisticsReminderOpening.current = true;
      try {
        const { data, error } = await supabase.rpc('get_duty_statistics_reminder_target', {
          p_access_token: statisticsReminderToken
        });
        if (error) throw error;
        const target = Array.isArray(data) ? data[0] : data;
        if (!target) throw new Error('This Statistics reminder is no longer available. The Statistics may already have been completed, or the link may have expired.');

        const occurrence = generatedOccurrences.find(item => item.slotId === target.slot_id && item.date === target.duty_date);
        if (!occurrence || !occurrence.assignedJpIds.includes(currentUser.id)) {
          throw new Error('The duty from this reminder could not be found in your roster.');
        }
        if (cancelled) return;

        setActiveTab('statistics');
        handleOpenLogStatsModal(occurrence, null, currentUser);
        clearReminderFromAddress();
        setStatisticsReminderToken('');
      } catch (reminderError) {
        if (!cancelled) {
          alert(`Unable to open the Statistics reminder: ${reminderError.message}`);
          clearReminderFromAddress();
          setStatisticsReminderToken('');
        }
      } finally {
        if (!cancelled) statisticsReminderOpening.current = false;
      }
    };

    openReminder();
    return () => {
      cancelled = true;
      statisticsReminderOpening.current = false;
    };
  }, [statisticsReminderToken, currentUser, isAuthenticated, slotTemplates.length, serviceDesks.length, generatedOccurrences]);

  const handleOpenHomeBasedStatistics = () => {
    if (!currentUser) return;
    setLogStatsOccurrence({
      isHomeBasedService: true,
      date: getTimeZoneDateString(new Date(), DEFAULT_ROSTER_TIME_ZONE),
      startTime: '09:00',
      endTime: '',
      formattedDate: ''
    });
    setStatisticsSubjectUser(currentUser);
    setStatsForm({
      noOfJpDuties: calculateJpDuties(0.25),
      noOfClients: 0,
      noOfHoursWorked: 0.25,
      certifiedCopies: 0,
      statutoryDeclarations: 0,
      signatureWitnessed: 0,
      affidavits: 0,
      other: 0,
      notes: ''
    });
  };

  const handleStatsInputChange = (field, value, isFloat = false) => {
    if (isFloat) {
      const val = parseFloat(value);
      const cleanValue = isNaN(val) || val < 0 ? 0 : val;
      setStatsForm(prev => ({
        ...prev,
        [field]: cleanValue,
        ...(field === 'noOfHoursWorked' ? { noOfJpDuties: calculateJpDuties(cleanValue) } : {})
      }));
    } else {
      const val = parseInt(value, 10);
      setStatsForm(prev => ({ ...prev, [field]: isNaN(val) || val < 0 ? 0 : val }));
    }
  };

  const handleSaveStatsSubmit = async (e) => {
    e.preventDefault();
    if (!logStatsOccurrence || !currentUser || !statisticsSubjectUser) return;
    if (logStatsOccurrence.isHomeBasedService) {
      const { error } = await supabase.rpc('save_home_based_duty_statistic', {
        p_statistic_id: null,
        p_duty_date: logStatsOccurrence.date,
        p_start_time: logStatsOccurrence.startTime,
        p_values: {
          noOfClients: statsForm.noOfClients,
          noOfHoursWorked: statsForm.noOfHoursWorked,
          certifiedCopies: statsForm.certifiedCopies,
          statutoryDeclarations: statsForm.statutoryDeclarations,
          signatureWitnessed: statsForm.signatureWitnessed,
          affidavits: statsForm.affidavits,
          other: statsForm.other,
          notes: statsForm.notes
        }
      });
      if (error) { alert(`Unable to save Home Based Service statistics: ${error.message}`); return; }
      await loadSupabaseRoster(currentUser);
      setLogStatsOccurrence(null);
      setStatisticsSubjectUser(null);
      setStatsSuccessToast(true);
      setTimeout(() => setStatsSuccessToast(false), 4000);
      return;
    }
    if (hasLoggedStatisticsForOccurrence(logStatsOccurrence, statisticsSubjectUser.id)) {
      alert('Statistics have already been logged for this shift. To maintain them, open the Statistics tab.');
      setLogStatsOccurrence(null);
      return;
    }

    const desk = activeDeskMap[logStatsOccurrence.deskId] || {};

    const newStatEntry = {
      id: `stat-${Date.now()}`,
      jpId: statisticsSubjectUser.id,
      jpName: statisticsSubjectUser.fullName,
      warrantNumber: statisticsSubjectUser.warrantNumber,
      deskId: logStatsOccurrence.deskId,
      deskName: desk.name || 'Service Desk',
      deskCode: desk.code || 'JP',
      region: desk.region || 'Auckland East',
      slotId: logStatsOccurrence.slotId,
      occurrenceKey: logStatsOccurrence.instanceKey,
      date: logStatsOccurrence.date,
      startTime: logStatsOccurrence.startTime,
      endTime: logStatsOccurrence.endTime,
      noOfJpDuties: statsForm.noOfJpDuties,
      noOfClients: statsForm.noOfClients,
      noOfHoursWorked: statsForm.noOfHoursWorked,
      certifiedCopies: statsForm.certifiedCopies,
      statutoryDeclarations: statsForm.statutoryDeclarations,
      signatureWitnessed: statsForm.signatureWitnessed,
      affidavits: statsForm.affidavits,
      other: statsForm.other,
      notes: statsForm.notes
    };

    const { error } = await supabase.rpc('save_duty_statistic_for_member', {
      p_statistic_id: null,
      p_member_id: statisticsSubjectUser.id,
      p_slot_id: logStatsOccurrence.slotId,
      p_duty_date: logStatsOccurrence.date,
      p_values: {
        noOfClients: newStatEntry.noOfClients,
        noOfHoursWorked: newStatEntry.noOfHoursWorked,
        certifiedCopies: newStatEntry.certifiedCopies,
        statutoryDeclarations: newStatEntry.statutoryDeclarations,
        signatureWitnessed: newStatEntry.signatureWitnessed,
        affidavits: newStatEntry.affidavits,
        other: newStatEntry.other,
        notes: newStatEntry.notes
      }
    });
    if (error) { alert(`Unable to save statistics: ${error.message}`); return; }
    await loadSupabaseRoster(currentUser);
    setLogStatsOccurrence(null);
    setStatisticsSubjectUser(null);
    setStatsSuccessToast(true);
    setTimeout(() => setStatsSuccessToast(false), 4000);
  };

  // OPEN REGISTRATION MODAL
  const handleOpenRegisterModal = (occ, e) => {
    if (e) e.stopPropagation();
    if (occ.isHoliday) {
      alert('This slot is marked as a Holiday and is not available for registration.');
      return;
    }
    if (isOccurrenceFinished(occ)) {
      setPastRegistrationConfirmationOcc(occ);
      return;
    }
    setRegisterModalOcc(occ);
    setRegisterOption('SINGLE');
    setRegisterCountN(4);
    setRegisterUntilDate(occ.date);
  };

  // EXECUTE REGISTRATION LOGIC
  const executeRegistration = async (occurrence, scope, countN = null, untilDate = null) => {
    if (!occurrence || !currentUser) return;
    if (occurrence.isHoliday) {
      alert('This slot is marked as a Holiday and cannot be registered for.');
      return;
    }

    const { error } = await supabase.rpc('apply_duty_assignment_change', {
      p_action: 'REGISTER',
      p_slot_id: occurrence.slotId,
      p_start_date: occurrence.date,
      p_scope: scope,
      p_count_n: scope === 'NEXT_N' ? (parseInt(countN, 10) || 1) : null,
      p_until_date: scope === 'UNTIL_DATE' ? untilDate : null
    });
    if (error) {
      alert(`Unable to register: ${error.message}`);
      return;
    }

    // The database action is atomic. Reloading its saved result keeps every
    // calendar view identical to the shared roster on every device.
    await loadSupabaseRoster(currentUser);
    setRegisterModalOcc(null);
    setRegistrationSuccessToast(true);
    setTimeout(() => setRegistrationSuccessToast(false), 6000);
  };

  // EXECUTE REGISTRATION LOGIC
  const handleExecuteRegister = async () => {
    await executeRegistration(registerModalOcc, registerOption, registerCountN, registerUntilDate);
  };

  const handleConfirmPastRegistration = async () => {
    const occurrence = pastRegistrationConfirmationOcc;
    setPastRegistrationConfirmationOcc(null);
    // A historical duty is always an explicit, one-off record. It must never
    // create a repeating rule based on an already-finished occurrence.
    await executeRegistration(occurrence, 'SINGLE');
  };

  // OPEN WITHDRAWAL MODAL
  const handleOpenWithdrawModal = (occ, e) => {
    if (e) e.stopPropagation();
    if (isOccurrenceFinished(occ)) {
      setPastWithdrawalConfirmationOcc(occ);
      return;
    }
    setWithdrawModalOcc(occ);
    setWithdrawOption('SINGLE');
    setWithdrawCountN(4);
    setWithdrawUntilDate(occ.date);
  };

  // EXECUTE WITHDRAWAL LOGIC
  const executeWithdrawal = async (occurrence, scope, countN = null, untilDate = null) => {
    if (!occurrence || !currentUser) return;
    const { error } = await supabase.rpc('apply_duty_assignment_change', {
      p_action: 'WITHDRAW',
      p_slot_id: occurrence.slotId,
      p_start_date: occurrence.date,
      p_scope: scope,
      p_count_n: scope === 'NEXT_N' ? (parseInt(countN, 10) || 1) : null,
      p_until_date: scope === 'UNTIL_DATE' ? untilDate : null
    });
    if (error) {
      alert(`Unable to withdraw: ${error.message}`);
      return;
    }

    await loadSupabaseRoster(currentUser);
    setWithdrawModalOcc(null);
  };

  const handleExecuteWithdraw = async () => {
    await executeWithdrawal(withdrawModalOcc, withdrawOption, withdrawCountN, withdrawUntilDate);
  };

  const handleConfirmPastWithdrawal = async () => {
    const occurrence = pastWithdrawalConfirmationOcc;
    setPastWithdrawalConfirmationOcc(null);
    // A historical correction is always limited to the selected occurrence.
    await executeWithdrawal(occurrence, 'SINGLE');
  };

  const generateIcsFile = (occurrence, e) => {
    if (e) e.stopPropagation();
    if (isOccurrenceFinished(occurrence)) {
      alert('This shift has already finished and can no longer be added to your calendar.');
      return;
    }
    const desk = activeDeskMap[occurrence.deskId] || {};
    const icsContent = buildCalendarFile({
      profileId: currentUser?.id || 'member',
      slotId: occurrence.slotId,
      date: occurrence.date,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
      deskName: desk.name || 'Service Desk',
      deskAddress: desk.address || 'Auckland, New Zealand',
      timeZone: occurrence.timeZone || desk.timeZone || DEFAULT_ROSTER_TIME_ZONE,
    });

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `JP_Duty_${desk.code}_${occurrence.date}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => window.URL.revokeObjectURL(link.href), 0);
  };

  const handleOpenAddUserModal = () => {
    setEditingUserId(null);
    setUserForm({
      fullName: '',
      email: '',
      phone: '',
      warrantNumber: '',
      password: 'password123',
      role: 'Member',
      isProvisional: false,
      status: 'Approved'
    });
    setUserModalOpen(true);
  };

  const handleOpenEditUserModal = (u) => {
    setEditingUserId(u.id);
    setUserForm({
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      warrantNumber: warrantNumberDigits(u.warrantNumber),
      password: u.password || 'password123',
      role: u.role,
      isProvisional: u.isProvisional,
      status: u.status
    });
    setUserModalOpen(true);
  };

  const handleSaveUserSubmit = async (e) => {
    e.preventDefault();
    setLifecycleError('');
    const warrantNumber = normaliseWarrantNumber(userForm.warrantNumber);
    if (!warrantNumber) {
      alert('Enter the numeric part of the JP warrant number.');
      return;
    }
    if (editingUserId) {
      const existingUser = users.find(user => user.id === editingUserId);
      if (existingUser?.status !== 'Archived' && userForm.status === 'Archived') {
        alert('Use Archive Member from the member list. It checks that the JP is not assigned as a Primary or Secondary Desk Admin.');
        return;
      }
      if (existingUser?.status === 'Archived' && userForm.status !== 'Archived') {
        alert('Use Restore from the Archived member list to reactivate a member.');
        return;
      }
      try {
        if (existingUser.status === 'Approved') await updateMemberProfileAndRole({ memberId: editingUserId, fullName: userForm.fullName, phone: userForm.phone, warrantNumber, isProvisional: userForm.isProvisional, newRole: userForm.role, expectedStatus: existingUser.status, expectedRole: existingUser.role });
        else {
          const { error } = await supabase.from('profiles').update({ full_name: userForm.fullName, phone: userForm.phone, warrant_number: warrantNumber, is_provisional: userForm.isProvisional }).eq('id', editingUserId);
          if (error) throw error;
        }
      } catch (error) { alert(error.code === '23505' ? 'This JP warrant number is already registered. Please check the number.' : `Unable to save member: ${error.message}`); return; }
      await loadSupabaseRoster(currentUser);
    } else {
      alert('Create new accounts through the Supabase sign-up process. They will appear here as Pending for approval.');
      return;
    }
    setUserModalOpen(false);
  };

  const handleRequestArchiveUser = async (memberId) => {
    const member = users.find(user => user.id === memberId);
    if (!member) return;

    if (memberId === currentUser?.id) {
      alert('You cannot archive the account you are currently signed in with. Ask another Registrar to maintain this account if required.');
      return;
    }

    const managedDesks = serviceDesks.filter(desk => !desk.isHomeBasedService && (desk.primaryAdminId === memberId || desk.secondaryAdminId === memberId));
    if (managedDesks.length > 0) {
      const deskNames = managedDesks.map(desk => desk.name).join(', ');
      alert(`${member.fullName} cannot be archived because they are assigned as a Primary or Secondary Desk Admin for: ${deskNames}. Reassign or clear those Desk Admin roles first.`);
      return;
    }

    try {
      setLifecycleError(''); setArchivePreview({ member, ...(await getMemberLifecyclePreview(memberId)) }); setPendingArchiveUserId(memberId);
    } catch (error) {
      setLifecycleError(`Unable to load the archive preview: ${error.message}`);
    }
  };

  const confirmArchiveUser = async () => {
    const memberId = pendingArchiveUserId;
    if (!memberId) return;

    if (memberId === currentUser?.id) {
      alert('You cannot archive the account you are currently signed in with. Ask another Registrar to maintain this account if required.');
      setPendingArchiveUserId(null);
      return;
    }

    const managedDesks = serviceDesks.filter(desk => !desk.isHomeBasedService && (desk.primaryAdminId === memberId || desk.secondaryAdminId === memberId));
    if (managedDesks.length > 0) {
      const deskNames = managedDesks.map(desk => desk.name).join(', ');
      alert(`This member is now assigned as a Primary or Secondary Desk Admin for: ${deskNames}. Reassign or clear those Desk Admin roles before archiving.`);
      setPendingArchiveUserId(null);
      return;
    }

    try { setArchiveSubmitting(true); await applyMemberLifecycleTransition({ memberId, action: 'ARCHIVE', expectedStatus: 'Approved', expectedRole: users.find(user => user.id === memberId)?.role }); await loadSupabaseRoster(currentUser); setPendingArchiveUserId(null); setArchivePreview(null); }
    catch (error) { setLifecycleError(`Unable to archive member: ${error.message}`); await loadSupabaseRoster(currentUser).catch(() => {}); }
    finally { setArchiveSubmitting(false); }
  };

  const handleRestoreArchivedUser = (memberId) => { const member = users.find(user => user.id === memberId); if (member) { setLifecycleError(''); setReinstateRole(''); setPendingReinstateUser(member); } };
  const confirmRestoreArchivedUser = async () => {
    if (!pendingReinstateUser || !reinstateRole) return;
    try { setReinstateSubmitting(true); await applyMemberLifecycleTransition({ memberId: pendingReinstateUser.id, action: 'REINSTATE', newRole: reinstateRole, expectedStatus: 'Archived' }); await loadSupabaseRoster(currentUser); setPendingReinstateUser(null); }
    catch (error) { setLifecycleError(`Unable to restore member: ${error.message}`); await loadSupabaseRoster(currentUser).catch(() => {}); }
    finally { setReinstateSubmitting(false); }
  };

  const handleOpenAddRegionModal = () => {
    setEditingRegionId(null);
    setRegionForm({ name: '', code: '', timezone: DEFAULT_ROSTER_TIME_ZONE });
    setRegionModalOpen(true);
  };

  const handleOpenEditRegionModal = (r) => {
    setEditingRegionId(r.id);
    setRegionForm({ name: r.name, code: r.code, timezone: r.timezone || DEFAULT_ROSTER_TIME_ZONE });
    setRegionModalOpen(true);
  };

  const handleSaveRegionSubmit = async (e) => {
    e.preventDefault();
    if (editingRegionId) {
      const oldRegion = regions.find(r => r.id === editingRegionId);
      const { error } = await supabase.from('regions').update({ name: regionForm.name, code: regionForm.code, timezone: regionForm.timezone }).eq('id', editingRegionId);
      if (error) { alert(`Unable to save region: ${error.message}`); return; }
      setRegions(prev => prev.map(r => r.id === editingRegionId ? { ...r, ...regionForm } : r));
      
      if (oldRegion && oldRegion.name !== regionForm.name) {
        setServiceDesks(prev => prev.map(d => d.region === oldRegion.name ? { ...d, region: regionForm.name } : d));
      }
    } else {
      const { data: newReg, error } = await supabase.from('regions').insert({ name: regionForm.name, code: regionForm.code, timezone: regionForm.timezone }).select().single();
      if (error) { alert(`Unable to add region: ${error.message}`); return; }
      setRegions(prev => [...prev, newReg]);
      setSelectedDeskRegions(prev => [...prev, newReg.name]);
    }
    setRegionModalOpen(false);
  };

  const confirmDeleteRegion = () => {
    const regToDelete = regions.find(r => r.id === pendingDeleteRegionId);
    setRegions(prev => prev.filter(r => r.id !== pendingDeleteRegionId));
    if (regToDelete) {
      setSelectedDeskRegions(prev => prev.filter(rName => rName !== regToDelete.name));
    }
    setPendingDeleteRegionId(null);
  };

  const handleCreateDeskSubmit = async (e) => {
    e.preventDefault();

    if (currentUser?.role !== 'Registrar') return;

    if (newDeskForm.primaryAdminId && newDeskForm.primaryAdminId === newDeskForm.secondaryAdminId) {
      alert('Primary Admin and Secondary Admin cannot be the same person.');
      return;
    }

    const region = regions.find(item => item.name === newDeskForm.region) || regions[0];
    const { error } = await supabase.rpc('create_service_desk_for_current_user', {
      p_code: newDeskForm.code,
      p_name: newDeskForm.name,
      p_address: newDeskForm.address,
      p_region_id: region.id,
      p_primary_admin_id: newDeskForm.primaryAdminId,
      p_secondary_admin_id: newDeskForm.secondaryAdminId || null,
      p_site_contact_name: newDeskForm.siteContactName || '',
      p_site_contact_email: newDeskForm.siteContactEmail || '',
      p_contact_person: newDeskForm.contactPerson || '',
      p_notes: newDeskForm.notes || ''
    });
    if (error) { alert(`Unable to create service desk: ${error.message}`); return; }
    await loadSupabaseRoster(currentUser);
    setCreateDeskModalOpen(false);
    setNewDeskForm({ 
      code: '', 
      name: '', 
      address: '', 
      region: regions[0]?.name || 'Auckland East', 
      primaryAdminId: '',
      secondaryAdminId: '', 
      siteContactName: '', 
      siteContactEmail: '', 
      contactPerson: '', 
      notes: '' 
    });
  };

  const handleOpenCreateDeskModal = () => {
    setNewDeskForm({
      code: '', name: '', address: '', region: regions[0]?.name || 'Auckland East',
      primaryAdminId: '', secondaryAdminId: '',
      siteContactName: '', siteContactEmail: '', contactPerson: '', notes: ''
    });
    setCreateDeskModalOpen(true);
  };

  const handleStartEditDesk = (desk) => {
    if (!canMaintainDesk(desk)) return;
    setEditingDeskId(desk.id);
    setEditDeskForm({
      code: desk.code || '',
      name: desk.name || '',
      address: desk.address || '',
      region: desk.region || regions[0]?.name || 'Auckland East',
      primaryAdminId: desk.primaryAdminId || '',
      secondaryAdminId: desk.secondaryAdminId || '',
      siteContactName: desk.siteContactName || '',
      siteContactEmail: desk.siteContactEmail || '',
      contactPerson: desk.contactPerson || '',
      notes: desk.notes || ''
    });
  };

  const handleSaveDeskDirectly = async (e) => {
    e.preventDefault();

    if (!canMaintainDesk(editingDeskId)) return;

    if (editDeskForm.primaryAdminId && editDeskForm.primaryAdminId === editDeskForm.secondaryAdminId) {
      alert('Primary Admin and Secondary Admin cannot be the same person.');
      return;
    }

    const desk = serviceDesks.find(item => item.id === editingDeskId);
    const primaryAdminId = editDeskForm.primaryAdminId || null;
    const secondaryAdminId = editDeskForm.secondaryAdminId || null;
    const region = regions.find(item => item.name === editDeskForm.region) || regions[0];
    const { error } = await supabase.rpc('update_service_desk_with_administrators', {
      p_desk_id: editingDeskId,
      p_code: editDeskForm.code,
      p_name: editDeskForm.name,
      p_address: editDeskForm.address,
      p_region_id: region.id,
      p_primary_admin_id: primaryAdminId,
      p_secondary_admin_id: secondaryAdminId,
      p_expected_primary_admin_id: desk?.primaryAdminId || null,
      p_expected_secondary_admin_id: desk?.secondaryAdminId || null,
      p_site_contact_name: editDeskForm.siteContactName || '',
      p_site_contact_email: editDeskForm.siteContactEmail || '',
      p_contact_person: editDeskForm.contactPerson || '',
      p_notes: editDeskForm.notes || ''
    });
    if (error) {
      const message = error.code === '40001'
        ? error.message
        : `Unable to save service desk: ${error.message}`;
      alert(message);
      const refreshedRoster = await loadSupabaseRoster(currentUser);
      const refreshedDesk = refreshedRoster.desks.find(item => item.id === editingDeskId);
      if (refreshedDesk) {
        setEditDeskForm({
          code: refreshedDesk.code || '',
          name: refreshedDesk.name || '',
          address: refreshedDesk.address || '',
          region: refreshedDesk.region || regions[0]?.name || 'Auckland East',
          primaryAdminId: refreshedDesk.primaryAdminId || '',
          secondaryAdminId: refreshedDesk.secondaryAdminId || '',
          siteContactName: refreshedDesk.siteContactName || '',
          siteContactEmail: refreshedDesk.siteContactEmail || '',
          contactPerson: refreshedDesk.contactPerson || '',
          notes: refreshedDesk.notes || ''
        });
        setEditingDeskId(refreshedDesk.id);
      }
      return;
    }
    await loadSupabaseRoster(currentUser);
    setEditingDeskId(null);
  };

  const confirmDeleteDesk = async () => {
    if (!canMaintainDesk(pendingDeleteDeskId)) {
      setPendingDeleteDeskId(null);
      return;
    }
    const { error } = await supabase.from('service_desks').update({ status: 'Archived' }).eq('id', pendingDeleteDeskId);
    if (error) { alert(`Unable to archive service desk: ${error.message}`); return; }
    await loadSupabaseRoster(currentUser);
    setPendingDeleteDeskId(null);
    if (editingDeskId === pendingDeleteDeskId) setEditingDeskId(null);
  };

  const saveServiceDeskFiltersNow = async (view, selectedRegions) => {
    if (!currentUser || preferencesReadyForProfile !== currentUser.id) return;

    try {
      // This targeted update uses the established calendar_filters JSON field,
      // rather than relying on the general delayed preference save.
      await saveUserPreferences(currentUser.id, {
        calendar_filters: {
          desk: calendarDeskFilter,
          member_desk_ids: memberCalendarDeskIds,
          region: calendarRegionFilter,
          time_of_day: calendarTimeOfDayFilter,
          days: calendarDayFilter,
          weeks: calendarDisplayWeeks,
          service_desks: { view, regions: selectedRegions }
        }
      });
    } catch (preferencesSaveError) {
      alert(`Unable to save your Service Desk filters: ${preferencesSaveError.message}`);
    }
  };

  const handleDeskViewFilterChange = (view) => {
    setDeskViewFilter(view);
    void saveServiceDeskFiltersNow(view, selectedDeskRegions);
  };

  const toggleRegionSelection = (regionName) => {
    const nextRegions = selectedDeskRegions.includes(regionName)
      ? selectedDeskRegions.filter(name => name !== regionName)
      : [...selectedDeskRegions, regionName];
    setSelectedDeskRegions(nextRegions);
    void saveServiceDeskFiltersNow(deskViewFilter, nextRegions);
  };

  const toggleAllRegions = () => {
    const nextRegions = selectedDeskRegions.length === regions.length
      ? []
      : regions.map(region => region.name);
    setSelectedDeskRegions(nextRegions);
    void saveServiceDeskFiltersNow(deskViewFilter, nextRegions);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      <PortalAlerts
        pendingMembersNoticeCount={pendingMembersNoticeCount}
        registrationSuccessToast={registrationSuccessToast}
        statsSuccessToast={statsSuccessToast}
        onDismissPendingMembersNotice={handleDismissPendingNoticeAndGoToRegistrar}
      />

      <PlatformHeader
        currentUser={currentUser}
        isAuthenticated={isAuthenticated}
        onSignOut={handleSignOut}
      />

      {/* --- MAIN CONTAINER --- */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* --- LANDING / LOGIN PAGE (WHEN NOT AUTHENTICATED) --- */}
        {authRestoring ? (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full border-4 border-slate-200 border-t-amber-500 animate-spin" />
            <h2 className="text-lg font-extrabold text-slate-900">Restoring your session</h2>
            <p className="text-xs text-slate-500">Please wait while the AJPA Roster Portal securely reloads your account.</p>
          </div>
        ) : !isAuthenticated ? (
          pendingApprovalUser ? (
            <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
              <div className="text-center space-y-3">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <span className="inline-block bg-amber-100 text-amber-900 text-[10px] font-black px-2.5 py-1 rounded uppercase tracking-wider">Email address confirmed</span>
                <h2 className="text-2xl font-black text-slate-900">Your access is being approved</h2>
                <p className="text-sm text-slate-600 leading-relaxed">Your email address has been confirmed. An AJPA Registrar is now reviewing your access before you can continue to the portal.</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                <div><span className="font-bold text-slate-500">Name:</span> <span className="font-extrabold text-slate-900">{pendingApprovalUser.fullName}</span></div>
                <div><span className="font-bold text-slate-500">JP number:</span> <span className="font-mono font-extrabold text-slate-900">{pendingApprovalUser.warrantNumber}</span></div>
                <div><span className="font-bold text-slate-500">Email:</span> <span className="font-bold text-slate-900 break-all">{pendingApprovalUser.email}</span></div>
              </div>

              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-900 leading-relaxed">
                You will receive an email when your access has been approved. Once approved, simply sign in with this email address and your password — you will not need to complete the sign-up process again.
              </div>

              <button type="button" onClick={handlePendingApprovalReturnToLogin} className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-lg font-bold text-sm shadow transition cursor-pointer">Return to Sign In</button>
            </div>
          ) : resetScreenOpen ? (
            /* PASSWORD RESET PAGE FROM EMAIL LINK */
            <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto">
                  <Key className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-black text-slate-900">Create New Password</h2>
                <p className="text-xs text-slate-500">Set a new secure password for your AJPA JP Member account.</p>
              </div>

              {resetError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs font-bold flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              <form onSubmit={handleSaveNewPassword} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg pr-10 p-2.5 text-sm"
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      title={showNewPassword ? 'Hide Password' : 'Show Password'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg pr-10 p-2.5 text-sm"
                      placeholder="Re-enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      title={showConfirmPassword ? 'Hide Password' : 'Show Password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-lg font-bold text-sm shadow transition cursor-pointer"
                >
                  Update Password & Return to Login
                </button>
              </form>
            </div>
          ) : (
            /* STANDARD LANDING / LOGIN SCREEN OR HELP TAB WHEN UNAUTHENTICATED */
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="bg-white rounded-xl shadow-sm p-2 border border-slate-200 flex flex-wrap gap-2 justify-end">
                <button 
                  onClick={() => setShowUnauthHelp(!showUnauthHelp)} 
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    showUnauthHelp ? 'bg-amber-500 text-slate-950 shadow' : 'bg-slate-900 text-amber-400 hover:bg-slate-800'
                  }`}
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>{showUnauthHelp ? 'Return to Sign In' : 'Platform Help & Sign-Up Guide'}</span>
                </button>
              </div>

              {showUnauthHelp ? (
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
                  <div className="border-b border-slate-200 pb-4">
                    <span className="bg-amber-500 text-slate-950 font-black text-xs px-2.5 py-1 rounded uppercase tracking-wider">Help & Guidelines</span>
                    <h2 className="text-2xl font-black text-slate-900 mt-2">Getting Started with the AJPA Service Desk Portal</h2>
                    <p className="text-xs text-slate-500 mt-1">Instructions for New JPs and Public Visitors</p>
                  </div>

                  <div className="space-y-4 text-xs text-slate-700">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h3 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                        <UserPlus className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>1. How to Sign Up for a Portal Account</span>
                      </h3>
                      <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed font-medium">
                        <li>Click the <b>"Click here to Sign up"</b> button located at the bottom of the Sign In card on the main page.</li>
                        <li>Fill in your full legal name, the numeric part of your warrant number (e.g. <code className="bg-white px-1 border rounded">25138</code>), mobile phone, and active email address.</li>
                        <li>Check the <b>Provisional JP</b> box if you are currently undertaking provisional service.</li>
                        <li>Enter your password twice. The two passwords must match; use the eye icons if you need to show or hide either entry.</li>
                        <li>Submit the form. Your account status will be marked as <b>Pending</b>, a confirmation email will be sent, and AJPA Registrars will be notified for review.</li>
                        <li>Once an AJPA Registrar approves your warrant details, you can log in with your email and password.</li>
                      </ol>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h3 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                        <Key className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>2. Resetting Your Password</span>
                      </h3>
                      <p className="leading-relaxed">
                        If you forget your password, click <b>"Forgot password?"</b> on the Sign In form, enter your registered email address, and follow the link sent to your inbox to set a new password.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                  <div className="md:col-span-7 space-y-5">
                    <span className="bg-amber-100 text-amber-900 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                      Official Association Portal
                    </span>
                    <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                      Auckland JP Service Desk Roster & Governance Platform
                    </h2>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Welcome to the beta test roster management hub for Justices of the Peace across Auckland. Sign in to manage your duty shifts, view your personal rolling service desk calendar, export device schedules, and log desk statistics.
                    </p>

                    <div className="pt-2 grid grid-cols-2 gap-4 text-xs font-bold text-slate-700">
                      <div className="flex items-center space-x-2 bg-white p-3 rounded-xl border border-slate-200">
                        <Calendar className="w-5 h-5 text-amber-600 shrink-0" />
                        <span>Personal Rolling Calendar</span>
                      </div>
                      <div className="flex items-center space-x-2 bg-white p-3 rounded-xl border border-slate-200">
                        <MapPin className="w-5 h-5 text-sky-600 shrink-0" />
                        <span>Regional Desk Roster</span>
                      </div>
                    </div>

                    {demoModeEnabled && (
                    <div className="bg-slate-200/70 p-4 rounded-xl border border-slate-300/80 space-y-2">
                      <span className="text-[11px] font-black uppercase text-slate-600 tracking-wider block">
                        Demo Fast Access (Click to test roles):
                      </span>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button onClick={() => handleQuickDemoLogin('Registrar')} className="px-3 py-1.5 bg-purple-900 text-white rounded-lg font-bold hover:bg-purple-800 transition cursor-pointer">
                          Login as Registrar
                        </button>
                        <button onClick={() => handleQuickDemoLogin('Admin')} className="px-3 py-1.5 bg-sky-800 text-white rounded-lg font-bold hover:bg-sky-700 transition cursor-pointer">
                          Login as Desk Admin
                        </button>
                        <button onClick={() => handleQuickDemoLogin('Member')} className="px-3 py-1.5 bg-slate-900 text-amber-400 rounded-lg font-bold hover:bg-slate-800 transition cursor-pointer">
                          Login as JP Member
                        </button>
                      </div>
                    </div>
                    )}
                  </div>

                  <div className="md:col-span-5 bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-5">
                    <div className="border-b border-slate-100 pb-4">
                      <h3 className="text-xl font-black text-slate-900">Sign In to Your Account</h3>
                      <p className="text-xs text-slate-500 mt-1">Enter your registered email address and password</p>
                    </div>

                    {loginError && (
                      <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs font-bold flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{loginError}</span>
                      </div>
                    )}

                    <form onSubmit={handleLoginSubmit} autoComplete="on" className="space-y-4 text-xs">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input 
                            type="email"
                            name="email"
                            autoComplete="username"
                            required 
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg pl-9 p-2.5 text-sm font-medium"
                            placeholder="e.g. rob@broadbridge.co.nz"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block font-bold text-slate-700">Password</label>
                          <button 
                            type="button" 
                            onClick={() => {
                              setForgotModalOpen(true);
                              setResetLinkSent(false);
                              setResetEmail('');
                            }}
                            className="text-[11px] text-sky-700 hover:text-sky-800 font-bold underline cursor-pointer"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input 
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            autoComplete="current-password"
                            required 
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg pl-9 pr-10 p-2.5 text-sm font-medium"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                            title={showPassword ? "Hide Password" : "Show Password"}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit" 
                        className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-lg font-extrabold text-sm shadow transition cursor-pointer"
                      >
                        Sign In
                      </button>
                    </form>

                    <div className="pt-4 border-t border-slate-100 text-center space-y-2">
                      <span className="text-xs text-slate-500 block">Not signed up on the AJPA Roster yet?</span>
                      <button
                        onClick={() => {
                          setSignUpForm(EMPTY_SIGN_UP_FORM);
                          setSignUpSuccessMsg(false);
                          setShowSignUpPassword(false);
                          setShowSignUpConfirmPassword(false);
                          setSignUpPasswordError('');
                          setSignUpModalOpen(true);
                        }}
                        className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs uppercase tracking-wider shadow transition cursor-pointer"
                      >
                        Click here to Sign up
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          /* --- AUTHENTICATED PORTAL VIEW --- */
          <>
            <PortalNavigation
              activeTab={activeTab}
              calendarWeeks={calendarDisplayWeeks}
              canUseDeskMaintenance={canUseDeskMaintenance}
              currentUser={currentUser}
              onSelectTab={setActiveTab}
            />

            {/* TAB 1: CALENDAR VIEW */}
            {activeTab === 'calendar' && (
              <div className="space-y-6">
                <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{calendarDisplayWeeks}-Week Roster</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {currentUser.role === 'Member' ? 'Choose the followed desks and shift times you want to see.' : 'Filter calendar view by region, desk selection, and shift time of day.'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-200 overflow-hidden text-xs">
                    <div>
                      <button
                        type="button"
                        onClick={() => setCalendarFilterSections(previous => ({ ...previous, location: !previous.location }))}
                        aria-expanded={calendarFilterSections.location}
                        className="w-full flex items-center justify-between gap-3 px-3.5 py-3 bg-slate-50 hover:bg-slate-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Globe className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="font-extrabold text-slate-800">Location &amp; desks</span>
                          <span className="text-slate-500 truncate">
                            {calendarRegionFilter === 'ALL' ? 'All regions' : calendarRegionFilter}
                            {' · '}
                            {currentUser.role === 'Member'
                              ? (followedDesks.length > 0 && followedDesks.every(deskId => memberCalendarDeskIds.includes(deskId))
                                ? 'All followed desks'
                                : memberCalendarDeskIds.length === 0
                                  ? 'No desks selected'
                                  : `${memberCalendarDeskIds.length} followed desk${memberCalendarDeskIds.length === 1 ? '' : 's'}`)
                              : (calendarDeskFilter === 'ALL'
                                ? 'All service desks'
                                : calendarDeskFilter === 'FOLLOWED'
                                  ? 'Followed desks only'
                                  : activeDeskMap[calendarDeskFilter]?.name || 'Selected desk')}
                          </span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${calendarFilterSections.location ? 'rotate-180' : ''}`} />
                      </button>
                      {calendarFilterSections.location && (
                        <div className="px-3.5 py-3 bg-white space-y-3">
                          <label className="flex flex-wrap items-center gap-2 font-bold text-slate-700">
                            <span>Region</span>
                            <select
                              value={calendarRegionFilter}
                              onChange={(event) => {
                                const selectedRegion = event.target.value;
                                setCalendarRegionFilter(selectedRegion);
                                // Reset an incompatible individual-desk choice.
                                if (calendarDeskFilter !== 'ALL' && calendarDeskFilter !== 'FOLLOWED'
                                  && selectedRegion !== 'ALL'
                                  && activeDeskMap[calendarDeskFilter]?.region !== selectedRegion) {
                                  setCalendarDeskFilter('ALL');
                                }
                              }}
                              className="bg-white border border-slate-300 rounded px-2 py-1.5 font-bold text-slate-800 cursor-pointer"
                            >
                              <option value="ALL">All Regions</option>
                              {regions.map(region => <option key={region.id} value={region.name}>{region.name}</option>)}
                            </select>
                          </label>

                          {currentUser.role === 'Member' ? (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
                              <label className="flex items-center gap-1.5 font-extrabold text-slate-800 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={calendarRegionFollowedDeskIds.length > 0 && calendarRegionFollowedDeskIds.every(deskId => memberCalendarDeskIds.includes(deskId))}
                                  onChange={(event) => setMemberCalendarDeskIds(previous => event.target.checked
                                    ? [...new Set([...previous, ...calendarRegionFollowedDeskIds])]
                                    : previous.filter(deskId => !calendarRegionFollowedDeskIds.includes(deskId)))}
                                  className="accent-sky-700 cursor-pointer"
                                />
                                <span>{calendarRegionFilter === 'ALL' ? 'All Followed Desks' : 'All Followed Desks in this Region'}</span>
                              </label>
                              {calendarRegionDesks.filter(desk => followedDesks.includes(desk.id)).map(desk => (
                                <label key={desk.id} className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={memberCalendarDeskIds.includes(desk.id)}
                                    onChange={(event) => setMemberCalendarDeskIds(previous => event.target.checked
                                      ? [...new Set([...previous, desk.id])]
                                      : previous.filter(deskId => deskId !== desk.id))}
                                    className="accent-sky-700 cursor-pointer"
                                  />
                                  <span>[{desk.code}] {desk.name}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <label className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 font-bold text-slate-700">
                              <span>Desk</span>
                              <select
                                value={calendarDeskFilter}
                                onChange={(event) => setCalendarDeskFilter(event.target.value)}
                                className="bg-white border border-slate-300 rounded px-2 py-1.5 font-bold text-slate-800 cursor-pointer"
                              >
                                <option value="FOLLOWED">My Followed Desks Only</option>
                                <option value="ALL">All Service Desks</option>
                                {calendarRegionDesks.map(desk => <option key={desk.id} value={desk.id}>[{desk.code}] {desk.name}</option>)}
                              </select>
                            </label>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => setCalendarFilterSections(previous => ({ ...previous, time: !previous.time }))}
                        aria-expanded={calendarFilterSections.time}
                        className="w-full flex items-center justify-between gap-3 px-3.5 py-3 bg-white hover:bg-slate-50 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                          <span className="font-extrabold text-slate-800">Shift time</span>
                          <span className="text-slate-500 truncate">
                            {Object.values(calendarTimeOfDayFilter).every(Boolean)
                              ? 'All times'
                              : Object.entries(calendarTimeOfDayFilter).filter(([, selected]) => selected).map(([period]) => period.charAt(0).toUpperCase() + period.slice(1)).join(', ') || 'No times selected'}
                          </span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${calendarFilterSections.time ? 'rotate-180' : ''}`} />
                      </button>
                      {calendarFilterSections.time && (
                        <div className="flex flex-wrap gap-x-5 gap-y-2 px-3.5 py-3 bg-white">
                          {['morning', 'afternoon', 'evening'].map(period => (
                            <label key={period} className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={calendarTimeOfDayFilter[period]}
                                onChange={(event) => setCalendarTimeOfDayFilter(previous => ({ ...previous, [period]: event.target.checked }))}
                                className="rounded text-amber-500 cursor-pointer w-3.5 h-3.5"
                              />
                              <span>{period.charAt(0).toUpperCase() + period.slice(1)}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => setCalendarFilterSections(previous => ({ ...previous, days: !previous.days }))}
                        aria-expanded={calendarFilterSections.days}
                        className="w-full flex items-center justify-between gap-3 px-3.5 py-3 bg-slate-50 hover:bg-slate-100 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="font-extrabold text-slate-800">Days</span>
                          <span className="text-slate-500 truncate">
                            {Object.values(calendarDayFilter).every(Boolean)
                              ? 'All days'
                              : Object.entries(calendarDayFilter).filter(([, selected]) => selected).map(([day]) => day.slice(0, 3)).join(', ') || 'No days selected'}
                          </span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${calendarFilterSections.days ? 'rotate-180' : ''}`} />
                      </button>
                      {calendarFilterSections.days && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3 bg-white">
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                            <label key={day} className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={calendarDayFilter[day]}
                                onChange={(event) => setCalendarDayFilter(previous => ({ ...previous, [day]: event.target.checked }))}
                                className="rounded text-amber-500 cursor-pointer w-3.5 h-3.5"
                              />
                              <span>{day}</span>
                            </label>
                          ))}
                          <button
                            type="button"
                            onClick={() => setCalendarDayFilter({ ...DEFAULT_DAY_FILTER })}
                            className="text-sky-700 hover:text-sky-900 underline font-bold cursor-pointer"
                          >
                            Select all days
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {rollingCalendarWeeks.map(week => (
                    <div key={week.weekNumber} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-2 bg-slate-900 text-white px-3 py-2 rounded-lg">
                        <span className="font-extrabold text-amber-400 text-sm uppercase tracking-wide">
                          Week {week.weekNumber} of {calendarDisplayWeeks}
                        </span>
                        <span className="text-xs text-slate-300 font-bold">{week.startDate} to {week.endDate}</span>
                      </div>

                      <div className="grid gap-3 grid-cols-1 md:grid-cols-7">
                        {week.days.map(dayObj => {
                          if (!calendarDayFilter[dayObj.fullDayName]) return null;

                          const dayOccurrences = generatedOccurrences.filter(occ => {
                            const parentDesk = activeDeskMap[occ.deskId] || {};

                            if (calendarRegionFilter !== 'ALL' && parentDesk.region !== calendarRegionFilter) {
                              return false;
                            }

                            if (currentUser.role === 'Member') {
                              if (!memberCalendarDeskIds.includes(occ.deskId)) return false;
                            } else {
                              if (calendarDeskFilter === 'FOLLOWED' && !followedDesks.includes(occ.deskId)) return false;
                              if (calendarDeskFilter !== 'ALL' && calendarDeskFilter !== 'FOLLOWED' && occ.deskId !== calendarDeskFilter) return false;
                            }
                            
                            const [startH] = occ.startTime.split(':').map(Number);
                            let timePeriod = 'morning';
                            if (startH >= 17) {
                              timePeriod = 'evening';
                            } else if (startH >= 12) {
                              timePeriod = 'afternoon';
                            }

                            if (!calendarTimeOfDayFilter[timePeriod]) {
                              return false;
                            }

                            return occ.date === dayObj.isoDate;
                          }).sort((firstOccurrence, secondOccurrence) => {
                            const startDifference = (firstOccurrence.startTime || '').localeCompare(secondOccurrence.startTime || '');
                            if (startDifference !== 0) return startDifference;
                            const firstDeskName = activeDeskMap[firstOccurrence.deskId]?.name || '';
                            const secondDeskName = activeDeskMap[secondOccurrence.deskId]?.name || '';
                            return firstDeskName.localeCompare(secondDeskName);
                          });

                          return (
                            <div key={dayObj.isoDate} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 min-h-[120px] space-y-2">
                              <div className="border-b border-slate-200 pb-1.5 bg-slate-100/90 px-2 py-1.5 rounded flex flex-col items-center justify-center text-center gap-1">
                                <span className="font-black text-slate-900 text-xs uppercase tracking-wide block">{dayObj.fullDayName}</span>
                                <span className="text-slate-950 font-black text-[11px] tracking-tight bg-white px-2 py-0.5 rounded border border-slate-200 shadow-xs block whitespace-nowrap">{dayObj.formattedDate}</span>
                              </div>

                              {dayOccurrences.length === 0 ? (
                                <div className="text-[11px] text-slate-400 italic py-2 text-center">No shifts</div>
                              ) : (
                                dayOccurrences.map(occ => {
                                  const desk = activeDeskMap[occ.deskId] || {};
                                  const assigned = occ.assignedJpIds.length;
                                  const firstRegisteredJp = assigned > 0 ? userMap[occ.assignedJpIds[0]] : null;
                                  const firstRegisteredJpName = firstRegisteredJp?.fullName || (assigned > 0 ? 'Registered JP' : '');
                                  const isRegistered = occ.assignedJpIds.includes(currentUser.id);
                                  const statsLogged = hasLoggedStatisticsForOccurrence(occ);
                                  const shiftFinished = isOccurrenceFinished(occ);

                                  let colorClass = 'bg-rose-50 border-rose-300 text-rose-900 hover:bg-rose-100';
                                  if (occ.isHoliday) colorClass = 'bg-slate-200 border-slate-400 text-slate-600 opacity-80 hover:bg-slate-300';
                                  else if (assigned >= occ.targetJps) colorClass = 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100';
                                  else if (assigned >= occ.minJps) colorClass = 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100';

                                  return (
                                    <div 
                                      key={occ.instanceKey} 
                                      onClick={() => setDetailedSlotModal(occ)} 
                                      className={`p-2 rounded-lg border text-xs cursor-pointer shadow-sm transition space-y-2 ${colorClass}`}
                                    >
                                      <div className="font-extrabold flex justify-between items-center">
                                        <span className="bg-slate-900 text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-black">{desk.code || 'JP'}</span>
                                        {occ.isHoliday ? (
                                          <span className="text-[10px] font-black bg-slate-700 text-white px-1.5 py-0.5 rounded">{occ.holidayDescription ? 'Statutory holiday' : 'Desk closed'}</span>
                                        ) : (
                                          <span className="text-[10px] font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">{assigned}/{occ.targetJps} JPs</span>
                                        )}
                                      </div>

                                      <div className="font-bold truncate text-[11px] text-slate-900">{desk.name}</div>
                                      <div className="text-[10px] font-semibold text-slate-700 flex items-center space-x-1">
                                        <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                        <span>{occ.startTime} - {occ.endTime}</span>
                                      </div>
                                      <div className="h-3 w-full min-w-0 flex items-center whitespace-nowrap text-[10px] font-bold text-slate-900" title={firstRegisteredJpName}>
                                        {assigned > 0 && <>
                                          <span className="min-w-0 flex-1 truncate">{firstRegisteredJpName}</span>
                                          {assigned > 1 && <span className="shrink-0">{` +${assigned - 1}`}</span>}
                                        </>}
                                      </div>

                                      <div className="pt-1.5 border-t border-slate-200/60 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        {occ.isHoliday ? (
                                          <div className="w-full py-1 px-2 rounded font-black text-[10px] uppercase text-center bg-slate-300 text-slate-600 cursor-not-allowed" title={occ.holidayDescription || 'Desk closed'}>
                                            {occ.holidayDescription ? `Statutory holiday: ${occ.holidayDescription}` : 'Desk closed'}
                                          </div>
                                        ) : isRegistered ? (
                                          <>
                                            <div className="grid grid-cols-2 gap-1">
                                              <button 
                                                type="button" 
                                                onClick={(e) => handleOpenLogStatsModal(occ, e)} 
                                                disabled={statsLogged || !shiftFinished}
                                                className={`py-1 px-1 rounded font-black text-[9px] uppercase shadow-xs flex items-center justify-center space-x-0.5 transition ${statsLogged || !shiftFinished ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'}`}
                                                title={statsLogged ? 'Statistics already logged — use the Statistics tab to maintain them' : shiftFinished ? 'Log Shift Statistics' : 'Statistics can be logged after this shift has ended'}
                                              >
                                                <BarChart2 className="w-2.5 h-2.5 shrink-0" />
                                                <span>{statsLogged ? 'Stats Logged' : 'Log Stats'}</span>
                                              </button>

                                              <button 
                                                type="button" 
                                                onClick={(e) => generateIcsFile(occ, e)}
                                                disabled={shiftFinished}
                                                className={`py-1 px-1 rounded font-black text-[9px] uppercase shadow-xs flex items-center justify-center space-x-0.5 transition ${shiftFinished ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-500 text-white cursor-pointer'}`}
                                                title={shiftFinished ? 'This shift has finished' : 'Add to Device Calendar'}
                                              >
                                                <CalendarPlus className="w-2.5 h-2.5 shrink-0" />
                                                <span>Add to Cal</span>
                                              </button>
                                            </div>

                                            <button 
                                              type="button" 
                                              onClick={(e) => handleOpenWithdrawModal(occ, e)} 
                                              className="w-full py-1 px-2 rounded font-black text-[10px] uppercase shadow-sm transition flex items-center justify-center space-x-1 bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                                              title={shiftFinished ? 'Withdraw from this completed shift' : 'Withdraw from this shift'}
                                            >
                                              <UserCheck className="w-3 h-3" />
                                              <span>Withdraw</span>
                                            </button>
                                          </>
                                        ) : (
                                          <button 
                                            type="button" 
                                            onClick={(e) => handleOpenRegisterModal(occ, e)} 
                                            className="w-full py-1 px-2 rounded font-black text-[10px] uppercase shadow-sm transition flex items-center justify-center space-x-1 bg-slate-900 hover:bg-slate-800 text-amber-400 cursor-pointer"
                                          >
                                            <UserCheck className="w-3 h-3" />
                                            <span>Register</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: SERVICE DESKS */}
            {activeTab === 'service-desks' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Fixed JP Service Desks</h2>
                      <p className="text-xs text-slate-500 mt-1">Select one or more regions below to display matching service desks grouped by region and sorted alphabetically.</p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold">
                        <button onClick={() => handleDeskViewFilterChange('Active')} className={`px-3 py-1.5 rounded-md cursor-pointer ${deskViewFilter === 'Active' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                          Active Desks ({activeDesksList.length})
                        </button>
                        <button onClick={() => handleDeskViewFilterChange('Archived')} className={`px-3 py-1.5 rounded-md cursor-pointer ${deskViewFilter === 'Archived' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                          Archived Desks ({archivedDesksList.length})
                        </button>
                      </div>

                      {currentUser?.role === 'Registrar' && (
                        <button type="button" onClick={handleOpenCreateDeskModal} className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold shadow flex items-center space-x-1 cursor-pointer">
                          <Plus className="w-4 h-4" />
                          <span>Create Service Desk</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
                        <Globe className="w-4 h-4 text-amber-600" />
                        <span>Filter by Regions</span>
                      </span>
                      <button 
                        onClick={toggleAllRegions}
                        className="text-xs text-sky-700 hover:text-sky-800 font-bold underline cursor-pointer"
                      >
                        {selectedDeskRegions.length === regions.length ? 'Deselect All' : 'Select All Regions'}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      {regions.map(r => {
                        const isSelected = selectedDeskRegions.includes(r.name);
                        return (
                          <button
                            key={r.id}
                            onClick={() => toggleRegionSelection(r.name)}
                            className={`px-3 py-1.5 rounded-lg font-bold border flex items-center space-x-1.5 transition cursor-pointer ${
                              isSelected 
                                ? 'bg-slate-900 text-amber-400 border-slate-900 shadow-sm' 
                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            <span>{r.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {Object.entries(groupedServiceDesks).map(([regionName, desks]) => {
                  const regionObj = regions.find(r => r.name === regionName) || { code: 'AKL' };

                  return (
                    <div key={regionName} className="space-y-4">
                      <div className="flex items-center space-x-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl border-l-4 border-amber-500 shadow-sm">
                        <span className="bg-amber-500 text-slate-950 font-black text-xs px-2 py-0.5 rounded uppercase">
                          {regionObj.code}
                        </span>
                        <h3 className="font-extrabold text-base tracking-wide">{regionName}</h3>
                        <span className="text-xs text-slate-400 font-normal">({desks.length} {desks.length === 1 ? 'Desk' : 'Desks'})</span>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        {desks.map(desk => {
                          const isFollowed = followedDesks.includes(desk.id);
                          const isEditing = editingDeskId === desk.id;
                          const canMaintainThisDesk = canMaintainDesk(desk);

                          const primaryAdmin = userMap[desk.primaryAdminId];
                          const secondaryAdmin = userMap[desk.secondaryAdminId];

                          const deskSlotTemplates = slotTemplates
                            .filter(slot => slot.deskId === desk.id)
                            .sort(compareRecurringSlots);

                          return (
                            <div key={desk.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                              {isEditing ? (
                                <form onSubmit={handleSaveDeskDirectly} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-amber-300 text-xs">
                                  <h4 className="font-bold text-slate-900 text-sm">Editing Service Desk Maintenance Profile</h4>
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                      <label className="block font-bold text-slate-700 mb-1">2-Letter Desk Code</label>
                                      <input type="text" maxLength={2} required value={editDeskForm.code} onChange={(e) => setEditDeskForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} className="w-full border rounded p-2 uppercase font-extrabold text-amber-600 bg-white" />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="block font-bold text-slate-700 mb-1">Service Desk Name</label>
                                      <input type="text" required value={editDeskForm.name} onChange={(e) => setEditDeskForm(prev => ({ ...prev, name: e.target.value }))} className="w-full border rounded p-2 font-bold bg-white" />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="block font-bold text-slate-700 mb-1">Physical Address</label>
                                      <input type="text" required value={editDeskForm.address} onChange={(e) => setEditDeskForm(prev => ({ ...prev, address: e.target.value }))} className="w-full border rounded p-2 bg-white" />
                                    </div>
                                    <div>
                                      <label className="block font-bold text-slate-700 mb-1">Region</label>
                                      <select value={editDeskForm.region} onChange={(e) => setEditDeskForm(prev => ({ ...prev, region: e.target.value }))} className="w-full border rounded p-2 font-bold text-slate-900 bg-white">
                                        {regions.map(r => (
                                          <option key={r.id} value={r.name}>{r.name} [{r.code}]</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-amber-50/60 p-3 rounded-lg border border-amber-200">
                                    <div>
                                      <label className="block font-extrabold text-slate-800 mb-1">Primary Desk Admin</label>
                                      <select 
                                        value={editDeskForm.primaryAdminId} 
                                        onChange={(e) => setEditDeskForm(prev => ({ ...prev, primaryAdminId: e.target.value }))} 
                                        className="w-full border border-slate-300 rounded p-2 font-bold text-slate-900 bg-white"
                                      >
                                        <option value="">-- Vacant --</option>
                                        {eligibleAdminsList.map(u => (
                                          <option key={u.id} value={u.id}>{formatEligibleDeskAdmin(u)}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block font-extrabold text-slate-800 mb-1">Secondary Desk Admin</label>
                                      <select 
                                        value={editDeskForm.secondaryAdminId} 
                                        onChange={(e) => setEditDeskForm(prev => ({ ...prev, secondaryAdminId: e.target.value }))} 
                                        className="w-full border border-slate-300 rounded p-2 font-bold text-slate-900 bg-white"
                                      >
                                        <option value="">-- Vacant --</option>
                                        {eligibleAdminsList
                                          .filter(u => u.id !== editDeskForm.primaryAdminId)
                                          .map(u => (
                                            <option key={u.id} value={u.id}>{formatEligibleDeskAdmin(u)}</option>
                                          ))}
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-sky-50/60 p-3 rounded-lg border border-sky-200">
                                    <div>
                                      <label className="block font-bold text-slate-700 mb-1">Site Contact Name</label>
                                      <input type="text" value={editDeskForm.siteContactName} onChange={(e) => setEditDeskForm(prev => ({ ...prev, siteContactName: e.target.value }))} className="w-full border rounded p-2 bg-white" placeholder="Site Manager" />
                                    </div>
                                    <div>
                                      <label className="block font-bold text-slate-700 mb-1">Site Contact Email</label>
                                      <input type="email" value={editDeskForm.siteContactEmail} onChange={(e) => setEditDeskForm(prev => ({ ...prev, siteContactEmail: e.target.value }))} className="w-full border rounded p-2 bg-white" placeholder="site.manager@facility.co.nz" />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block font-bold text-slate-700 mb-1">Desk Notes & Operational Instructions</label>
                                    <textarea rows={2} value={editDeskForm.notes} onChange={(e) => setEditDeskForm(prev => ({ ...prev, notes: e.target.value }))} className="w-full border rounded p-2 bg-white text-xs" placeholder="Specific guidelines or instructions for duty JPs..." />
                                  </div>

                                  <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                                    <button type="button" onClick={() => setEditingDeskId(null)} className="px-4 py-2 rounded text-xs font-bold bg-slate-200">Cancel</button>
                                    <button type="submit" className="px-4 py-2 rounded text-xs font-bold bg-emerald-600 text-white">Save Desk Profile</button>
                                  </div>
                                </form>
                              ) : (
                                <>
                                  <div className="flex flex-wrap justify-between items-start gap-2">
                                    <div>
                                      <div className="flex items-center space-x-2">
                                        <span className="bg-slate-900 text-amber-400 text-xs font-black px-2 py-0.5 rounded uppercase">{desk.code || 'JP'}</span>
                                        <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200 flex items-center space-x-1">
                                          <Globe className="w-3 h-3 shrink-0" />
                                          <span>{desk.region}</span>
                                        </span>
                                      </div>
                                      <h3 className="text-xl font-bold text-slate-900 mt-1">{desk.name}</h3>
                                      <p className="text-sm text-slate-600 flex items-center space-x-1 mt-1">
                                        <MapPin className="w-4 h-4 text-sky-600 shrink-0" />
                                        <span className="font-medium">{desk.address}</span>
                                      </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      {canMaintainThisDesk && desk.status === 'Active' && (
                                        <>
                                          <button 
                                            type="button" 
                                            onClick={() => handleOpenAddSlotModal(desk.id)} 
                                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-600 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer shadow-xs"
                                            title="Create Shift Slot for this Desk"
                                          >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Create Slot</span>
                                          </button>
                                          <button onClick={() => handleStartEditDesk(desk)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer">
                                            <Edit2 className="w-3.5 h-3.5" />
                                            <span>Maintain Desk</span>
                                          </button>
                                          <button onClick={() => setPendingDeleteDeskId(desk.id)} className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer">
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>Delete Desk</span>
                                          </button>
                                        </>
                                      )}

                                      <button onClick={() => handleToggleFollowDesk(desk.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${isFollowed ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-50 text-slate-700 border-slate-300'}`}>
                                        {isFollowed ? '★ Following' : '+ Follow'}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="space-y-1">
                                      <div className="font-extrabold text-slate-900 uppercase tracking-wider text-[10px] text-amber-700">Assigned Desk Governance</div>
                                      <div className="flex items-center space-x-1.5">
                                        <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                        <span className="font-bold text-slate-700">Primary Admin:</span>
                                        <span className="font-extrabold text-slate-900">{primaryAdmin ? `${primaryAdmin.fullName} (${primaryAdmin.warrantNumber})` : 'Unassigned'}</span>
                                      </div>
                                      <div className="flex items-center space-x-1.5">
                                        <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span className="font-bold text-slate-700">Secondary Admin:</span>
                                        <span className="font-extrabold text-slate-900">{secondaryAdmin ? `${secondaryAdmin.fullName} (${secondaryAdmin.warrantNumber})` : 'Unassigned'}</span>
                                      </div>
                                    </div>

                                    <div className="space-y-1 md:border-l md:border-slate-200 md:pl-3">
                                      <div className="font-extrabold text-slate-900 uppercase tracking-wider text-[10px] text-sky-700">Facility / Site Contact</div>
                                      <div className="flex items-center space-x-1.5">
                                        <Users className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                        <span className="font-bold text-slate-700">Site Contact:</span>
                                        <span className="font-semibold text-slate-900">{desk.siteContactName || desk.contactPerson || 'Not Specified'}</span>
                                      </div>
                                      <div className="flex items-center space-x-1.5">
                                        <Mail className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                        <span className="font-bold text-slate-700">Contact Email:</span>
                                        <span className="font-semibold text-slate-900">{desk.siteContactEmail || 'N/A'}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-xs text-slate-600 bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                                    <span className="font-bold text-slate-800 block mb-0.5">Notes & Desk Instructions:</span>
                                    <span>{desk.notes || 'No specific operational notes recorded for this desk.'}</span>
                                  </div>

                                  <div className="pt-3 border-t border-slate-200 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center space-x-1">
                                        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                        <span>Configured Recurring Shift Slots ({deskSlotTemplates.length})</span>
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-bold">{canMaintainThisDesk ? 'Click tile to maintain slot' : 'Shift settings are view-only'}</span>
                                    </div>

                                    {deskSlotTemplates.length === 0 ? (
                                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center text-xs text-slate-400 italic">
                                        No shift slots configured for this service desk.
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {deskSlotTemplates.map(slot => {
                                          return (
                                            <div
                                              key={slot.id}
                                              onClick={canMaintainThisDesk ? () => handleOpenEditSlotModal(slot) : undefined}
                                              className={`p-2.5 rounded-lg border text-xs shadow-sm transition space-y-1.5 ${canMaintainThisDesk ? 'cursor-pointer' : 'cursor-default'} ${
                                                slot.status === 'Active'
                                                  ? 'bg-amber-50/90 border-amber-300 text-amber-900 hover:bg-amber-100'
                                                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                                              }`}
                                            >
                                              <div className="font-extrabold flex justify-between items-center">
                                                <span className="bg-slate-900 text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-black">{desk.code || 'JP'}</span>
                                                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${slot.status === 'Active' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-200 text-slate-700 border-slate-300'}`}>
                                                  {slot.status}
                                                </span>
                                              </div>

                                              <div className="font-black text-xs text-slate-900">{slot.dayOfWeek}s</div>
                                              <div className="text-[11px] font-semibold text-slate-700 flex items-center space-x-1">
                                                <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                                <span>{slot.startTime} - {slot.endTime}</span>
                                              </div>

                                              <div className="pt-1 border-t border-slate-200/60 text-[10px] font-bold text-slate-600 flex justify-between items-center">
                                                <span>Capacity:</span>
                                                <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-slate-900">
                                                  {slot.minJps} / {slot.targetJps} / {slot.maxJps} JPs
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 3: MY SHIFTS */}
            {activeTab === 'my-shifts' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
                <div className="flex flex-wrap justify-between items-center gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">My Registered Roster Shifts</h2>
                    <p className="text-xs text-slate-500 mt-1">Interrogate your registered duty shifts across any past or future date ranges.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-300 text-xs font-bold">
                    <Filter className="w-4 h-4 text-amber-600 shrink-0" />
                    <label className="text-slate-700" htmlFor="my-shifts-date-filter">Date:</label>
                    <select 
                      id="my-shifts-date-filter"
                      value={myShiftsPreset}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMyShiftsPreset(val);
                        if (val === 'CUSTOM') {
                          setMyShiftsCustomModalOpen(true);
                        }
                      }}
                      className="bg-white border border-slate-300 rounded px-2 py-1 font-bold text-slate-900 cursor-pointer shadow-xs"
                    >
                      <option value="DEFAULT_13_WEEKS">Prior Week + Calendar Wks 1-12 (Default)</option>
                      <option value="DEFAULT_5WEEKS">Prior Week + Calendar Wks 1-4</option>
                      <option value="NEXT_4_WEEKS">Calendar Wks 1-4</option>
                      <option value="THIS_MONTH">This Month</option>
                      <option value="LAST_MONTH">Last Month</option>
                      <option value="NEXT_MONTH">Next Month</option>
                      <option value="CUSTOM">Custom Date Range...</option>
                    </select>
                    {myShiftsPreset === 'CUSTOM' && (
                      <button
                        type="button"
                        onClick={() => setMyShiftsCustomModalOpen(true)}
                        className="px-2 py-1 rounded border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 font-extrabold cursor-pointer"
                      >
                        Change range
                      </button>
                    )}
                    <label className="text-slate-700" htmlFor="my-shifts-desk-filter">Desk:</label>
                    <select
                      id="my-shifts-desk-filter"
                      value={myShiftsDeskFilter}
                      onChange={(e) => setMyShiftsDeskFilter(e.target.value)}
                      className="bg-white border border-slate-300 rounded px-2 py-1 font-bold text-slate-900 cursor-pointer shadow-xs max-w-48"
                    >
                      <option value="ALL">All Service Desks</option>
                      {activeDesksList.map(desk => (
                        <option key={desk.id} value={desk.id}>[{desk.code}] {desk.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* DESCRIPTOR HEADER BANNER */}
                <div className="bg-amber-50 border-l-4 border-amber-500 p-3.5 rounded-r-xl flex items-center justify-between text-xs text-slate-800 shadow-xs">
                  <div className="flex items-center space-x-2 font-bold">
                    <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>{myShiftsFilterDescriptor.label}</span>
                  </div>
                  <span className="bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded font-black text-[10px] uppercase tracking-wider shrink-0 ml-2">
                    {myShiftsFilteredList.length} {myShiftsFilteredList.length === 1 ? 'Shift' : 'Shifts'}
                  </span>
                </div>

                {myShiftsFilteredList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-slate-200">
                    You have no registered shifts matching the selected filters.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myShiftsFilteredList.map(occ => {
                      const desk = activeDeskMap[occ.deskId] || {};
                      const statsLogged = hasLoggedStatisticsForOccurrence(occ);
                      const shiftFinished = isOccurrenceFinished(occ);
                      return (
                        <div key={occ.instanceKey} onClick={() => setDetailedSlotModal(occ)} className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap justify-between items-center gap-3 cursor-pointer hover:bg-slate-100 transition shadow-xs">
                          <div>
                            <h3 className="font-bold text-slate-900 flex items-center space-x-2">
                              <span className="bg-slate-900 text-amber-400 text-xs px-2 py-0.5 rounded font-black">{desk.code || 'JP'}</span>
                              <span>{desk.name}</span>
                            </h3>
                            <p className="text-xs text-slate-600 font-semibold mt-1">
                              📅 {occ.fullDayName}, {occ.formattedDate} • ⏰ {occ.startTime} - {occ.endTime}
                            </p>
                          </div>
                          <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                            <button onClick={(e) => handleOpenLogStatsModal(occ, e)} disabled={statsLogged || !shiftFinished} title={statsLogged ? 'Statistics already logged — use the Statistics tab to maintain them' : shiftFinished ? 'Log Shift Statistics' : 'Statistics can be logged after this shift has ended'} className={`px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 shadow-xs ${statsLogged || !shiftFinished ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'}`}>
                              <BarChart2 className="w-3.5 h-3.5" />
                              <span>{statsLogged ? 'Stats Logged' : 'Log Stats'}</span>
                            </button>
                            <button onClick={(e) => generateIcsFile(occ, e)} disabled={shiftFinished} title={shiftFinished ? 'This shift has finished' : 'Add to Device Calendar'} className={`px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 shadow-xs ${shiftFinished ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700 text-white cursor-pointer'}`}>
                              <CalendarPlus className="w-3.5 h-3.5" />
                              <span>Add to Cal</span>
                            </button>
                            <button onClick={(e) => handleOpenWithdrawModal(occ, e)} title={shiftFinished ? 'Withdraw from this completed shift' : 'Withdraw from this shift'} className="px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 shadow-xs bg-rose-600 hover:bg-rose-700 text-white cursor-pointer">
                              <UserX className="w-3.5 h-3.5" />
                              <span>Withdraw</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: MY PROFILE */}
            {activeTab === 'my-profile' && (
              <div className="max-w-3xl space-y-6">
                <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-200 space-y-2">
                  <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">My Profile</span>
                  <h2 className="text-xl font-extrabold text-slate-900">Your AJPA Portal Details</h2>
                  <p className="text-xs text-slate-500">Keep your contact and warrant details current. Your role is maintained by an AJPA Registrar.</p>
                </div>

                <form onSubmit={handleSaveMyProfile} className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-200 space-y-5 text-xs">
                  {profileSaveError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg font-bold flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{profileSaveError}</span>
                    </div>
                  )}
                  {profileSaveMessage && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg font-bold flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{profileSaveMessage}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Full legal name</label>
                      <input value={currentUser.fullName || ''} readOnly className="w-full border border-slate-200 rounded-lg p-2.5 font-bold text-slate-600 bg-slate-100 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Warrant number</label>
                      <div className="flex rounded-lg border border-slate-300 overflow-hidden bg-white focus-within:ring-2 focus-within:ring-amber-300">
                        <span className="px-3 py-2.5 bg-slate-100 border-r border-slate-300 font-mono font-bold text-slate-700">JP-</span>
                        <input type="text" required inputMode="numeric" pattern="[0-9]*" value={profileForm.warrantNumber} onChange={(event) => setProfileForm(previous => ({ ...previous, warrantNumber: warrantNumberDigits(event.target.value) }))} className="min-w-0 flex-1 p-2.5 text-sm font-mono outline-none" placeholder="12345" />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Enter the number only.</p>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Portal role</label>
                      <input value={currentUser.role || ''} readOnly className="w-full border border-slate-200 rounded-lg p-2.5 font-bold text-slate-600 bg-slate-100 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Account status</label>
                      <input value={`${currentUser.status || ''}${currentUser.isProvisional ? ' · Provisional JP' : ''}`} readOnly className="w-full border border-slate-200 rounded-lg p-2.5 font-bold text-slate-600 bg-slate-100 cursor-not-allowed" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Email address</label>
                      <input type="email" required value={profileForm.email} onChange={(event) => setProfileForm(previous => ({ ...previous, email: event.target.value }))} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm" />
                      <p className="text-[10px] text-slate-500 mt-1">Changing this may require confirmation from the new email address.</p>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Mobile phone</label>
                      <input type="tel" value={profileForm.phone} onChange={(event) => setProfileForm(previous => ({ ...previous, phone: event.target.value }))} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm" placeholder="e.g. 021 123 4567" />
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                    <div>
                      <h3 className="font-extrabold text-slate-900">Calendar display</h3>
                      <p className="text-[11px] text-slate-600 mt-1">Choose how far ahead your rolling calendar should show: 4 to 20 weeks (about 1 to 5 months).</p>
                    </div>
                    <div className="max-w-xs">
                      <label className="block font-bold text-slate-700 mb-1">Number of weeks to display</label>
                      <input
                        type="number"
                        min="4"
                        max="20"
                        step="1"
                        required
                        value={profileForm.calendarWeeks}
                        onChange={(event) => setProfileForm(previous => ({ ...previous, calendarWeeks: event.target.value }))}
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white"
                      />
                    </div>
                  </div>

                  {isCurrentUserDeskAdmin && (
                    <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-3">
                      <div>
                        <h3 className="font-extrabold text-slate-900">Desk Admin roster reminders</h3>
                        <p className="text-[11px] text-slate-600 mt-1">At midnight on each scheduled day, you will receive one email covering your Primary and Secondary desks for the selected reporting period.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Email reminders</label>
                          <select value={profileForm.reminderFrequency} onChange={(event) => setProfileForm(previous => ({ ...previous, reminderFrequency: event.target.value }))} className="w-full border border-slate-300 rounded-lg p-2 bg-white font-bold">
                            <option value="NONE">No reminders</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="FORTNIGHTLY">Fortnightly</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Start date</label>
                          <input type="date" disabled={profileForm.reminderFrequency === 'NONE'} value={profileForm.reminderStartDate} onChange={(event) => setProfileForm(previous => ({ ...previous, reminderStartDate: event.target.value }))} className="w-full border border-slate-300 rounded-lg p-2 bg-white disabled:bg-slate-100 disabled:text-slate-400" />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Weeks to report on</label>
                          <input type="number" min="1" max="52" disabled={profileForm.reminderFrequency === 'NONE'} value={profileForm.reminderWeeks} onChange={(event) => setProfileForm(previous => ({ ...previous, reminderWeeks: event.target.value }))} className="w-full border border-slate-300 rounded-lg p-2 bg-white disabled:bg-slate-100 disabled:text-slate-400" />
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-600">
                        Managed desks: {serviceDesks.filter(desk => !desk.isHomeBasedService && (desk.primaryAdminId === currentUser.id || desk.secondaryAdminId === currentUser.id)).map(desk => `[${desk.code}] ${desk.name}`).join(', ') || 'No Primary or Secondary desk assignments are currently recorded.'}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <button type="submit" disabled={profileSaving} className="px-5 py-2.5 rounded-lg text-xs font-extrabold bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-amber-400 shadow cursor-pointer disabled:cursor-not-allowed">
                      {profileSaving ? 'Saving…' : 'Save Profile'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 4: STATISTICS LOG TAB */}
            {activeTab === 'statistics' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Service Desk Statistics Log</h2>
                      <p className="text-xs text-slate-500 mt-1">
                        {currentUser.role === 'Member' 
                          ? 'Viewing your personal logged shift statistics. Click any row to view, edit, or delete.' 
                          : 'Viewing full Association Service Desk statistics. Click any row to view, edit, or delete.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleOpenHomeBasedStatistics}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-black shadow flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Home Based Service</span>
                      </button>
                      <button
                        onClick={handleDownloadCsv}
                        className="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-black shadow flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Filtered CSV</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-100">
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
                      <label className="block font-extrabold text-slate-700">Date Range:</label>
                      <select 
                        value={statsDatePreset}
                        onChange={(e) => {
                          const val = e.target.value;
                          setStatsDatePreset(val);
                          if (val === 'CUSTOM') {
                            setCustomDateModalOpen(true);
                          }
                        }}
                        className="w-full bg-white border border-slate-300 rounded p-1.5 font-bold text-slate-900 cursor-pointer"
                      >
                        <option value="LAST_30_DAYS">Last 30 Days (Default)</option>
                        <option value="CURRENT_AND_PREVIOUS">Current & Previous Month</option>
                        <option value="CURRENT_MONTH">Current Month Only</option>
                        <option value="LAST_MONTH">Last Month Only</option>
                        <option value="CUSTOM">Custom Timeframe...</option>
                      </select>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
                      <label className="block font-extrabold text-slate-700">Region:</label>
                      <select 
                        value={statsRegionFilter}
                        onChange={(e) => setStatsRegionFilter(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded p-1.5 font-bold text-slate-900 cursor-pointer"
                      >
                        <option value="ALL">All Regions</option>
                        {regions.map(r => (
                          <option key={r.id} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
                      <label className="block font-extrabold text-slate-700">Service Desk:</label>
                      <select 
                        value={statsDeskFilter}
                        onChange={(e) => setStatsDeskFilter(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded p-1.5 font-bold text-slate-900 cursor-pointer"
                      >
                        <option value="ALL">All Service Desks</option>
                        {activeDesksList.map(d => (
                          <option key={d.id} value={d.id}>[{d.code}] {d.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
                      <label className="block font-extrabold text-slate-700">
                        JP Member {currentUser.role === 'Member' ? '(Self Restricted)' : ''}:
                      </label>
                      <select 
                        value={statsJpFilter}
                        onChange={(e) => setStatsJpFilter(e.target.value)}
                        disabled={currentUser.role === 'Member'}
                        className={`w-full bg-white border border-slate-300 rounded p-1.5 font-bold text-slate-900 cursor-pointer ${currentUser.role === 'Member' ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        {currentUser.role === 'Member' ? (
                          <option value={currentUser.id}>{currentUser.fullName} ({currentUser.warrantNumber})</option>
                        ) : (
                          <>
                            <option value="ALL">All JP Members</option>
                            {users.map(u => (
                              <option key={u.id} value={u.id}>{u.fullName} ({u.warrantNumber})</option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 className="font-bold text-slate-900 text-base">
                      Logged Statistics Records ({filteredStatisticsList.length})
                    </h3>
                    <span className="text-xs text-slate-500 font-bold">
                      Click any row to edit or delete record
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white uppercase font-black tracking-wider">
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Desk [Code]</th>
                          <th className="p-2.5">JP Member</th>
                          <th className="p-2.5 text-center">Duties</th>
                          <th className="p-2.5 text-center">Clients</th>
                          <th className="p-2.5 text-center">Hours</th>
                          <th className="p-2.5 text-center">Copies</th>
                          <th className="p-2.5 text-center">Stat Decs</th>
                          <th className="p-2.5 text-center">Witness</th>
                          <th className="p-2.5 text-center">Affidavits</th>
                          <th className="p-2.5">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredStatisticsList.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="p-6 text-center text-slate-400 italic">
                              No statistic records match your active filter criteria.
                            </td>
                          </tr>
                        ) : (
                          filteredStatisticsList.map(stat => (
                            <tr 
                              key={stat.id} 
                              onClick={() => handleOpenEditStatModal(stat)}
                              className="hover:bg-amber-50/80 cursor-pointer transition"
                              title="Click to view or edit this statistic log"
                            >
                              <td className="p-2.5 font-bold font-mono text-slate-900 whitespace-nowrap">{stat.date}</td>
                              <td className="p-2.5 font-bold text-slate-900">
                                <span className="bg-slate-900 text-amber-400 text-[10px] px-1.5 py-0.5 rounded font-black mr-1">{stat.deskCode}</span>
                                <span>{stat.deskName}</span>
                              </td>
                              <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">
                                <div>{stat.jpName}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{stat.warrantNumber}</div>
                              </td>
                              <td className="p-2.5 text-center font-bold text-slate-800">{stat.noOfJpDuties}</td>
                              <td className="p-2.5 text-center font-black text-amber-600 bg-amber-50/50">{stat.noOfClients}</td>
                              <td className="p-2.5 text-center font-bold text-sky-700 bg-sky-50/50">{stat.noOfHoursWorked}h</td>
                              <td className="p-2.5 text-center font-medium text-slate-700">{stat.certifiedCopies}</td>
                              <td className="p-2.5 text-center font-medium text-slate-700">{stat.statutoryDeclarations}</td>
                              <td className="p-2.5 text-center font-medium text-slate-700">{stat.signatureWitnessed}</td>
                              <td className="p-2.5 text-center font-medium text-slate-700">{stat.affidavits}</td>
                              <td className="p-2.5 text-slate-500 italic max-w-xs truncate">{stat.notes || '-'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* DESK MAINTENANCE: staff actions are independently permission checked by Supabase. */}
            {activeTab === 'desk-maintenance' && canUseDeskMaintenance && (
              <div className="space-y-6">
                <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900">Desk Maintenance</h2>
                    <p className="text-xs text-slate-500 mt-1">Register JPs, maintain their completed-shift statistics, and review desk activity. Desk Admins only see Service Desks assigned to them.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {[['assign-jps', 'Assign JPs'], ['jp-stats', 'JP Stats'], ['jp-contacts', 'JP Contacts'], ['activity', 'Activity Log']].map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setDeskMaintenanceSubTab(key)} className={`px-4 py-2 rounded-lg text-xs font-extrabold cursor-pointer ${deskMaintenanceSubTab === key ? 'bg-slate-900 text-amber-400 shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
                    ))}
                  </div>
                </div>

                {deskMaintenanceSubTab !== 'activity' && (
                  <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-3">
                    <Filter className="w-4 h-4 text-amber-600 mb-2 shrink-0" />
                    {deskMaintenanceSubTab === 'assign-jps' && <>
                      <label className="text-xs font-extrabold text-slate-700 flex flex-col gap-1">Date
                        <select value={deskMaintenanceDatePreset} onChange={(event) => {
                          const value = event.target.value;
                          setDeskMaintenanceDatePreset(value);
                          if (value === 'CUSTOM') setDeskMaintenanceCustomModalOpen(true);
                        }} className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900">
                          <option value="DEFAULT_13_WEEKS">Prior Week + Calendar Wks 1-12 (Default)</option>
                          <option value="DEFAULT_5WEEKS">Prior Week + Calendar Wks 1-4</option>
                          <option value="NEXT_4_WEEKS">Calendar Wks 1-4</option>
                          <option value="THIS_MONTH">This Month</option>
                          <option value="LAST_MONTH">Last Month</option>
                          <option value="NEXT_MONTH">Next Month</option>
                          <option value="CUSTOM">Custom Date Range...</option>
                        </select>
                      </label>
                      {deskMaintenanceDatePreset === 'CUSTOM' && (
                        <button type="button" onClick={() => setDeskMaintenanceCustomModalOpen(true)} className="px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 text-xs font-extrabold cursor-pointer">
                          Change range
                        </button>
                      )}
                    </>}
                    <label className="text-xs font-extrabold text-slate-700 flex flex-col gap-1">Service Desk
                      <select value={deskMaintenanceDeskFilter} onChange={(event) => setDeskMaintenanceDeskFilter(event.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900">
                        <option value="ALL">All authorised Service Desks</option>
                        {deskMaintenanceDesks.map(desk => <option key={desk.id} value={desk.id}>{desk.name} [{desk.code}]</option>)}
                      </select>
                    </label>
                    {deskMaintenanceSubTab === 'jp-stats' && (
                      <label className="text-xs font-extrabold text-slate-700 flex flex-col gap-1">Show
                        <select value={deskMaintenanceStatsFilter} onChange={(event) => setDeskMaintenanceStatsFilter(event.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900">
                          <option value="LAST_4_WEEKS">Last 4 weeks</option>
                          <option value="INCOMPLETE">Incomplete slots</option>
                        </select>
                      </label>
                    )}
                    <span className="text-[11px] text-slate-500 pb-2">{deskMaintenanceSubTab === 'jp-stats' ? (deskMaintenanceStatsFilter === 'INCOMPLETE' ? 'All past registered shifts that do not yet have statistics.' : 'Completed registered shifts from the last four weeks.') : deskMaintenanceSubTab === 'jp-contacts' ? 'Active approved JPs who follow the selected authorised Service Desk.' : deskMaintenanceDateFilterDescriptor.label}</span>
                  </div>
                )}

                {deskMaintenanceSubTab === 'assign-jps' && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 sm:p-5 border-b border-slate-100"><h3 className="font-extrabold text-slate-900">Assign JPs to shifts</h3><p className="text-xs text-slate-500 mt-1">Each action applies to one selected shift. A normal registration confirmation email is queued for the JP member.</p></div>
                    <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead><tr className="bg-slate-900 text-white uppercase font-black tracking-wider"><th className="p-2.5">Shift</th><th className="p-2.5">Service Desk</th><th className="p-2.5">Registered JPs</th><th className="p-2.5">Assign JP</th></tr></thead><tbody className="divide-y divide-slate-200">
                      {deskMaintenanceOccurrences.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">No shifts match this desk filter.</td></tr> : deskMaintenanceOccurrences.map(occ => {
                        const selectedMemberId = deskMaintenanceMemberSelections[occ.instanceKey] || '';
                        const availableMembers = activeMembersForDeskMaintenance.filter(member => !occ.assignedJpIds.includes(member.id));
                        return <tr key={occ.instanceKey} className="hover:bg-sky-50/50"><td className="p-2.5 whitespace-nowrap font-bold text-slate-800">{occ.date}<div className="text-[10px] text-slate-500">{occ.startTime}–{occ.endTime}{isOccurrenceFinished(occ) ? ' · completed' : ''}</div></td><td className="p-2.5"><span className="bg-slate-900 text-amber-400 text-[10px] px-1.5 py-0.5 rounded font-black mr-1">{activeDeskMap[occ.deskId]?.code || 'JP'}</span>{activeDeskMap[occ.deskId]?.name}</td><td className="p-2.5">{occ.assignedJpIds.length ? <div className="flex flex-wrap gap-1">{occ.assignedJpIds.map(memberId => <button type="button" key={memberId} onClick={() => handleStaffAssignmentChange(occ, memberId, 'WITHDRAW')} className="bg-rose-50 border border-rose-200 text-rose-800 rounded px-1.5 py-1 font-bold hover:bg-rose-100 cursor-pointer" title="Withdraw this JP member">{userMap[memberId]?.fullName || 'Unavailable JP'} ×</button>)}</div> : <span className="text-slate-400 italic">None</span>}</td><td className="p-2.5"><div className="flex gap-2"><select value={selectedMemberId} onChange={(event) => setDeskMaintenanceMemberSelections(previous => ({ ...previous, [occ.instanceKey]: event.target.value }))} className="min-w-48 border border-slate-300 rounded px-2 py-1.5 bg-white"><option value="">Select JP member…</option>{availableMembers.map(member => <option key={member.id} value={member.id}>{member.fullName}{member.warrantNumber ? ` (${member.warrantNumber})` : ''}</option>)}</select><button type="button" disabled={!selectedMemberId || occ.isHoliday || occ.assignedJpIds.length >= occ.maxJps} onClick={() => handleStaffAssignmentChange(occ, selectedMemberId, 'REGISTER')} className="px-3 py-1.5 rounded font-extrabold bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-500 text-white cursor-pointer disabled:cursor-not-allowed">Register</button></div>{occ.isHoliday && <div className="text-[10px] text-slate-500 mt-1">Desk closed</div>}{occ.assignedJpIds.length >= occ.maxJps && <div className="text-[10px] text-rose-600 mt-1">Maximum JP number reached</div>}</td></tr>;
                      })}</tbody></table></div>
                  </div>
                )}

                {deskMaintenanceSubTab === 'jp-stats' && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 sm:p-5 border-b border-slate-100"><h3 className="font-extrabold text-slate-900">JP shift statistics</h3><p className="text-xs text-slate-500 mt-1">{deskMaintenanceStatsFilter === 'INCOMPLETE' ? 'Every past registered shift without a statistics record. Use this list to complete outstanding statistics.' : 'Completed registered shifts from the last four weeks. Statistics can be logged or maintained after a shift has ended.'}</p></div>
                    {deskMaintenanceStatsFilter === 'INCOMPLETE' && incompleteDutyStatisticsError ? (
                      <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">The incomplete-statistics list is not available yet. Run the accompanying Supabase migration, then refresh this page. Detail: {incompleteDutyStatisticsError}</div>
                    ) : null}
                    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="bg-slate-900 text-white uppercase font-black tracking-wider"><th className="p-2.5">Shift</th><th className="p-2.5">Service Desk</th><th className="p-2.5">JP Member</th><th className="p-2.5">Action</th></tr></thead><tbody className="divide-y divide-slate-200">
                      {(deskMaintenanceStatsFilter === 'INCOMPLETE' ? deskMaintenanceIncompleteStatisticRows : deskMaintenanceRecentStatisticRows).length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">{deskMaintenanceStatsFilter === 'INCOMPLETE' ? (incompleteDutyStatisticsLoading ? 'Loading incomplete shifts…' : 'No incomplete registered shifts match this desk filter.') : 'No completed registered shifts match this desk filter.'}</td></tr> : (deskMaintenanceStatsFilter === 'INCOMPLETE' ? deskMaintenanceIncompleteStatisticRows : deskMaintenanceRecentStatisticRows).map(({ occ, memberId, memberName, warrantNumber, deskName, deskCode }) => { const existing = loggedStatistics.find(stat => stat.jpId === memberId && stat.slotId === occ.slotId && stat.date === occ.date); const member = userMap[memberId] || (memberName ? { id: memberId, fullName: memberName, warrantNumber } : null); return <tr key={`${occ.instanceKey}-${memberId}`} className="hover:bg-sky-50/50"><td className="p-2.5 whitespace-nowrap font-bold">{occ.date}<div className="text-[10px] text-slate-500">{occ.startTime}–{occ.endTime}</div></td><td className="p-2.5">{deskName || activeDeskMap[occ.deskId]?.name}<span className="ml-1 text-[10px] text-slate-400">{deskCode ? `[${deskCode}]` : ''}</span></td><td className="p-2.5 font-bold">{member?.fullName || 'Unavailable JP'}<div className="text-[10px] text-slate-400">{member?.warrantNumber || ''}</div></td><td className="p-2.5"><button type="button" onClick={() => existing ? handleOpenEditStatModal(existing) : handleOpenLogStatsModal(occ, null, member)} className={`px-3 py-1.5 rounded font-extrabold cursor-pointer ${existing ? 'bg-sky-100 text-sky-900 hover:bg-sky-200' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'}`}>{existing ? 'Maintain stats' : 'Log stats'}</button></td></tr>; })}</tbody></table></div>
                  </div>
                )}

                {deskMaintenanceSubTab === 'jp-contacts' && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 sm:p-5 border-b border-slate-100">
                      <h3 className="font-extrabold text-slate-900">JP contact report</h3>
                      <p className="text-xs text-slate-500 mt-1">Contact details for active approved JPs who follow your selected authorised Service Desk. A JP following more than one selected desk appears once.</p>
                    </div>
                    {deskMaintenanceContactsError ? (
                      <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">The JP Contacts report could not be loaded. {deskMaintenanceContactsError}</div>
                    ) : null}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-xs">
                        <thead><tr className="bg-slate-900 text-white uppercase font-black tracking-wider"><th className="p-2.5">Name</th><th className="p-2.5">Warrant Number</th><th className="p-2.5">Email Address</th><th className="p-2.5">Phone Number</th></tr></thead>
                        <tbody className="divide-y divide-slate-200">
                          {deskMaintenanceContactsLoading ? <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">Loading JP contacts…</td></tr>
                            : deskMaintenanceContacts.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">No active approved JPs follow the selected Service Desk.</td></tr>
                            : deskMaintenanceContacts.map(member => <tr key={member.id} className="hover:bg-sky-50/50"><td className="p-2.5 font-bold text-slate-900">{member.fullName}</td><td className="p-2.5 font-mono text-slate-700">{member.warrantNumber || '—'}</td><td className="p-2.5 text-slate-700">{member.email || '—'}</td><td className="p-2.5 text-slate-700">{member.phone || '—'}</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ACTIVITY LOG: the database returns all rows to Registrars, or only assigned desks to Desk Admins. */}
            {activeTab === 'desk-maintenance' && canViewActivityAudit && deskMaintenanceSubTab === 'activity' && (
              <div className="space-y-6">
                <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <span className="bg-sky-100 text-sky-900 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Desk Admin & Registrar access</span>
                    <h2 className="text-xl font-extrabold text-slate-900">Roster Activity Log</h2>
                    <p className="text-xs text-slate-500">
                      {activityLogRange === 'LAST_1000'
                        ? 'The latest 1,000 registration, withdrawal, and recurring-rule changes.'
                        : activityLogRange === 'DATE_RANGE'
                          ? `Activity from ${activityLogCustomFrom} to ${activityLogCustomTo} (up to 1,000 rows).`
                          : 'The latest 250 registration, withdrawal, and recurring-rule changes.'}{' '}
                      Entries are recorded by the database and cannot be edited in the portal.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-extrabold text-slate-700 flex flex-col gap-1">
                      Filter
                      <select
                        value={activityLogRange}
                        onChange={(event) => handleActivityLogRangeChange(event.target.value)}
                        disabled={activityLogLoading}
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-900 cursor-pointer disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="LAST_250">Last 250</option>
                        <option value="LAST_1000">Last 1,000</option>
                        <option value="DATE_RANGE">Date Range…</option>
                      </select>
                    </label>
                    {activityLogRange === 'DATE_RANGE' && (
                      <button
                        type="button"
                        onClick={() => setActivityLogCustomModalOpen(true)}
                        disabled={activityLogLoading}
                        className="px-3 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 text-xs font-extrabold cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        Change dates
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDownloadActivityLogCsv}
                      disabled={activityLogLoading || rosterActivityAudit.length === 0 || Boolean(rosterActivityAuditError)}
                      className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-300 disabled:text-slate-500 text-white px-4 py-2 rounded-lg text-xs font-extrabold shadow flex items-center space-x-1.5 transition cursor-pointer disabled:cursor-not-allowed"
                      title="Download the currently loaded Activity Log rows as a CSV file"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Activity Log CSV</span>
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
                  {rosterActivityAuditError ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-lg text-xs font-bold">
                      The activity log is not available yet. Run the Activity Audit Log SQL migration, then sign out and back in. Detail: {rosterActivityAuditError}
                    </div>
                  ) : activityLogLoading ? (
                    <div className="p-8 text-center text-slate-500 font-bold bg-slate-50 rounded-xl border border-slate-200">
                      Loading Activity Log…
                    </div>
                  ) : rosterActivityAudit.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-xl border border-slate-200">
                      No new roster activity has been recorded since the audit log was enabled.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse min-w-[850px]">
                        <thead>
                          <tr className="bg-slate-900 text-white uppercase font-black tracking-wider">
                            <th className="p-2.5">When (Auckland)</th>
                            <th className="p-2.5">Account</th>
                            <th className="p-2.5">Action</th>
                            <th className="p-2.5">JP affected</th>
                            <th className="p-2.5">Service Desk</th>
                            <th className="p-2.5">Shift / rule</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {rosterActivityAudit.map(activity => {
                            const actor = userMap[activity.actorProfileId];
                            const subject = userMap[activity.subjectProfileId];
                            const actionLabel = formatActivityAction(activity);
                            const ruleDetail = formatActivityRuleDetail(activity);
                            const occurredAt = activity.occurredAt
                              ? new Date(activity.occurredAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' })
                              : '—';

                            return (
                              <tr key={activity.id} className="hover:bg-sky-50/60">
                                <td className="p-2.5 whitespace-nowrap font-mono text-[11px] text-slate-700">{occurredAt}</td>
                                <td className="p-2.5 font-bold text-slate-900">{
                                  activity.actorProfileId
                                    ? actor?.fullName || 'Unavailable account'
                                    : 'Automated recurring roster process'
                                }</td>
                                <td className="p-2.5 font-bold text-slate-800">{actionLabel}</td>
                                <td className="p-2.5 text-slate-700">{subject?.fullName || 'Deleted or unavailable profile'}</td>
                                <td className="p-2.5 text-slate-700"><span className="bg-slate-900 text-amber-400 text-[10px] px-1.5 py-0.5 rounded font-black mr-1">{activity.deskCode || 'JP'}</span>{activity.deskName || 'Archived desk'}</td>
                                <td className="p-2.5 text-slate-700 whitespace-nowrap">{activity.dutyDate || activity.ruleStartDate || '—'} {activity.startTime && activity.endTime ? `· ${activity.startTime}–${activity.endTime}` : ''}<div className="text-[10px] text-slate-400 mt-0.5">{ruleDetail}</div></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activityLogCustomModalOpen && (
              <CustomDateRangeModal
                applyLabel="Apply Activity Log Range"
                fromDate={activityLogCustomFrom}
                onClose={() => setActivityLogCustomModalOpen(false)}
                onApply={handleApplyActivityLogDateRange}
                requireCompleteDateRange
                title="Activity Log Date Range"
                toDate={activityLogCustomTo}
              />
            )}

            {/* TAB 5: REGISTRAR GOVERNANCE PORTAL */}
            {activeTab === 'registrar' && currentUser.role === 'Registrar' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Registrar Governance Portal</h2>
                    <p className="text-xs text-slate-500 mt-1">Maintain master lists for JP Members, Shift Slot Templates, Master Regions, or export full system CSV archives.</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button 
                      onClick={handlePrepareFullDataDownload}
                      disabled={archivePreparing}
                      className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400 text-white px-4 py-2 rounded-lg text-xs font-extrabold shadow flex items-center space-x-1.5 transition cursor-pointer disabled:cursor-wait"
                      title="Export all application datasets into timestamped CSV files"
                    >
                      <Database className="w-4 h-4 text-emerald-300" />
                      <span>{archivePreparing ? 'Preparing Archive…' : 'Download Data (CSV Archive)'}</span>
                    </button>

                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold">
                      <button onClick={() => setRegistrarSubTab('members')} className={`px-4 py-2 rounded-md flex items-center space-x-1.5 cursor-pointer ${registrarSubTab === 'members' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                        <Users className="w-3.5 h-3.5" />
                        <span>JP Members ({users.length})</span>
                      </button>
                      <button onClick={() => setRegistrarSubTab('regions')} className={`px-4 py-2 rounded-md flex items-center space-x-1.5 cursor-pointer ${registrarSubTab === 'regions' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                        <Globe className="w-3.5 h-3.5" />
                        <span>Regions ({regions.length})</span>
                      </button>
                      <button onClick={() => setRegistrarSubTab('email-delivery')} className={`px-4 py-2 rounded-md flex items-center space-x-1.5 cursor-pointer ${registrarSubTab === 'email-delivery' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                        <Mail className="w-3.5 h-3.5" />
                        <span>Email Delivery{dutyNotificationFailures.length ? ` (${dutyNotificationFailures.length})` : ''}</span>
                      </button>
                      {currentUser.role === 'Registrar' && (
                        <button onClick={() => setRegistrarSubTab('statutory-holidays')} className={`px-4 py-2 rounded-md flex items-center space-x-1.5 cursor-pointer ${registrarSubTab === 'statutory-holidays' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Statutory Holidays ({statutoryHolidays.length})</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* SUBTAB 1: JP MEMBERS */}
                {registrarSubTab === 'members' && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                    {lifecycleError && !pendingArchiveUserId && !pendingReinstateUser && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{lifecycleError}</div>}
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">Association Members & Sign-up Queue</h3>
                        <p className="text-xs text-slate-500">Approve pending applications, maintain current profiles, or archive former members. Pending members appear at the top, followed by members sorted by surname, first name, and JP number.</p>
                      </div>
                      <button onClick={handleOpenAddUserModal} className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold shadow flex items-center space-x-1 cursor-pointer">
                        <UserPlus className="w-4 h-4" />
                        <span>Add New JP Member</span>
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-white p-1 border border-slate-200 text-xs font-bold">
                        <button type="button" onClick={() => setMemberDirectoryFilter('ACTIVE')} className={`px-3 py-1.5 rounded-md cursor-pointer ${memberDirectoryFilter === 'ACTIVE' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
                          Active ({memberDirectoryCounts.active})
                        </button>
                        <button type="button" onClick={() => setMemberDirectoryFilter('ARCHIVED')} className={`px-3 py-1.5 rounded-md cursor-pointer ${memberDirectoryFilter === 'ARCHIVED' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
                          Archived ({memberDirectoryCounts.archived})
                        </button>                        <button type="button" onClick={() => setMemberDirectoryFilter('REJECTED')} className={`px-3 py-1.5 rounded-md cursor-pointer ${memberDirectoryFilter === 'REJECTED' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
                          Rejected ({memberDirectoryCounts.rejected})
                        </button>
                        <button type="button" onClick={() => setMemberDirectoryFilter('ALL')} className={`px-3 py-1.5 rounded-md cursor-pointer ${memberDirectoryFilter === 'ALL' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
                          All ({memberDirectoryCounts.all})
                        </button>
                      </div>
                      <label className="relative flex items-center w-full sm:w-80">
                        <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="search"
                          value={memberDirectorySearch}
                          onChange={(event) => setMemberDirectorySearch(event.target.value)}
                          className="w-full border border-slate-300 rounded-lg py-2 pl-9 pr-3 text-xs font-bold text-slate-900 bg-white"
                          placeholder="Search name, warrant, email or phone"
                          aria-label="Search JP members"
                        />
                      </label>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 uppercase font-black tracking-wider border-b border-slate-200">
                            <th className="p-3">Warrant #</th>
                            <th className="p-3">Full Name</th>
                            <th className="p-3">Role</th>
                            <th className="p-3">Contact</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {visibleUsersForRegistrar.map(u => (
                            <tr key={u.id} className={`hover:bg-slate-50 transition ${u.status === 'Pending' ? 'bg-amber-50/80 border-l-4 border-amber-500' : ''}`}>
                              <td className="p-3 font-mono font-bold text-slate-900">{u.warrantNumber}</td>
                              <td className="p-3 font-bold text-slate-900">
                                {u.fullName}
                                {u.isProvisional && <span className="ml-2 bg-amber-400 text-slate-950 text-[10px] px-1.5 py-0.5 rounded font-bold">Provisional</span>}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded font-bold ${u.role === 'Registrar' ? 'bg-purple-100 text-purple-800' : u.role === 'Admin' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-800'}`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="p-3 text-slate-600">
                                <div>{u.email}</div>
                                <div className="text-[11px] text-slate-400">{u.phone}</div>
                              </td>
                              <td className="p-3">
                                {u.status === 'Pending' ? (
                                  <span className="bg-amber-200 text-amber-900 border border-amber-400 px-2 py-0.5 rounded font-black text-[10px] uppercase animate-pulse">
                                    Pending Approval
                                  </span>
                                ) : u.status === 'Approved' ? (
                                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded font-bold text-[10px]">
                                    Active / Approved
                                  </span>
                                ) : u.status === 'Rejected' ? (
                                  <button onClick={async () => { setLifecycleError(''); try { await applyMemberLifecycleTransition({ memberId: u.id, action: 'RECONSIDER', expectedStatus: 'Rejected' }); await loadSupabaseRoster(currentUser); } catch (error) { setLifecycleError(`Unable to return member to Pending: ${error.message}`); await loadSupabaseRoster(currentUser).catch(() => {}); } }} className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold text-[10px] cursor-pointer">
                                    Reconsider
                                  </button>
                                ) : u.status === 'Archived' ? (
                                  <span className="bg-slate-200 text-slate-700 border border-slate-300 px-2 py-0.5 rounded font-bold text-[10px]">
                                    Archived / Sign-in Disabled
                                  </span>
                                ) : (
                                  <span className="bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded font-bold text-[10px]">
                                    Rejected
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right space-x-1">
                                {u.status === 'Pending' ? (
                                  <div className="flex justify-end space-x-1">
                                    <button 
                                      onClick={() => handleApprovePendingUser(u.id)}
                                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] flex items-center space-x-0.5 cursor-pointer shadow-xs"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Approve</span>
                                    </button>
                                    <button 
                                      onClick={() => handleRejectPendingUser(u.id)}
                                      className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold text-[10px] flex items-center space-x-0.5 cursor-pointer shadow-xs"
                                    >
                                      <X className="w-3 h-3" />
                                      <span>Reject</span>
                                    </button>
                                  </div>
                                ) : u.status === 'Archived' ? (
                                  <>
                                    <button onClick={() => handleOpenEditUserModal(u)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer" title="Edit archived JP details">
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleRestoreArchivedUser(u.id)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px] cursor-pointer" title="Restore member access">
                                      Restore
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => handleOpenEditUserModal(u)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer" title="Edit JP Details">
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleRequestArchiveUser(u.id)} className="p-1.5 bg-amber-50 hover:bg-amber-100 rounded text-amber-800 cursor-pointer" title="Archive JP Member">
                                      <Archive className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {visibleUsersForRegistrar.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs font-bold text-slate-500">
                        No members match the selected filter and search.
                      </div>
                    )}
                  </div>
                )}

                {/* SUBTAB: EMAIL DELIVERY (Registrar-only) */}
                {registrarSubTab === 'email-delivery' && currentUser.role === 'Registrar' && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">Operational Health</h3>
                          <p className="text-xs text-slate-500 mt-1">A Registrar-only summary of scheduled email processes. It contains counts and job status, never email content.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRefreshRosterOperationalHealth}
                          disabled={rosterOperationalHealthLoading}
                          className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-amber-400 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {rosterOperationalHealthLoading ? 'Checking…' : 'Refresh Health'}
                        </button>
                      </div>

                      {rosterOperationalHealthError ? (
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg text-xs font-bold">
                          Operational health is not available. Run the Stage 13 SQL migration, then sign out and back in. Detail: {rosterOperationalHealthError}
                        </div>
                      ) : rosterOperationalHealth && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            {[
                              { label: 'Duty notifications', value: rosterOperationalHealth.dutyNotifications },
                              { label: 'Desk Admin reminders', value: rosterOperationalHealth.deskAdminReminders },
                              { label: 'Statistics reminders', value: rosterOperationalHealth.statisticsReminders },
                              { label: 'Monthly Statistics reports', value: rosterOperationalHealth.monthlyStatisticsReports }
                            ].map(item => (
                              <div key={item.label} className={`rounded-lg border p-3 ${item.value.failed ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                <p className="text-xs font-bold text-slate-800">{item.label}</p>
                                <p className={`text-sm font-extrabold mt-1 ${item.value.failed ? 'text-rose-700' : 'text-emerald-700'}`}>{item.value.failed} failed</p>
                                <p className="text-[11px] text-slate-600 mt-0.5">{item.value.waiting} waiting or retrying</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-[11px] text-slate-500">“Waiting or retrying” includes the normal five-minute confirmation delay. It only needs attention if it remains waiting unexpectedly or becomes failed.</p>
                          <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                            <table className="w-full min-w-[680px] text-left text-xs border-collapse">
                              <thead><tr className="bg-slate-100 text-slate-700 uppercase font-black tracking-wider"><th className="p-2.5">Scheduled process</th><th className="p-2.5">Schedule</th><th className="p-2.5">Last run</th><th className="p-2.5">Status</th></tr></thead>
                              <tbody className="divide-y divide-slate-200">
                                {rosterOperationalHealth.schedules.map(schedule => {
                                  const statusIsHealthy = schedule.active && (!schedule.lastStatus || schedule.lastStatus === 'succeeded');
                                  return (
                                    <tr key={schedule.jobName}>
                                      <td className="p-2.5 font-bold text-slate-800">{schedule.jobName}</td>
                                      <td className="p-2.5 font-mono text-slate-600">{schedule.schedule || 'Not scheduled'}</td>
                                      <td className="p-2.5 text-slate-600">{schedule.lastStartedAt ? new Date(schedule.lastStartedAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' }) : 'No run recorded yet'}</td>
                                      <td className={`p-2.5 font-bold ${statusIsHealthy ? 'text-emerald-700' : 'text-rose-700'}`}>{!schedule.active ? 'Inactive or missing' : schedule.lastStatus || 'Awaiting first run'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {rosterOperationalHealth.checkedAt && <p className="text-[10px] text-slate-400 text-right">Checked {new Date(rosterOperationalHealth.checkedAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' })}</p>}
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">Duty Email Delivery</h3>
                        <p className="text-xs text-slate-500 mt-1">Only emails that could not be delivered after five automatic attempts appear here. Correct the underlying email configuration first, then return the item to the delivery queue.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRefreshDutyNotificationFailures}
                        disabled={dutyNotificationFailuresLoading}
                        className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-amber-400 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {dutyNotificationFailuresLoading ? 'Refreshing…' : 'Refresh'}
                      </button>
                    </div>

                    {dutyNotificationFailuresError ? (
                      <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-lg text-xs font-bold">
                        The email-delivery list is not available. Run the Stage 3B SQL migration, then sign out and back in. Detail: {dutyNotificationFailuresError}
                      </div>
                    ) : dutyNotificationFailures.length === 0 ? (
                      <div className="py-10 text-center text-sm text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 rounded-xl">
                        No duty emails have permanently failed. Emails that are still within their automatic retry period do not need action here.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse min-w-[800px]">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 uppercase font-black tracking-wider border-b border-slate-200">
                              <th className="p-3">Updated</th>
                              <th className="p-3">JP Member</th>
                              <th className="p-3">Service Desk</th>
                              <th className="p-3">Duty Date</th>
                              <th className="p-3">Attempts</th>
                              <th className="p-3">Last Error</th>
                              <th className="p-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {dutyNotificationFailures.map(notification => (
                              <tr key={notification.id} className="hover:bg-rose-50/50">
                                <td className="p-3 whitespace-nowrap text-slate-700">{notification.updatedAt ? new Date(notification.updatedAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                                <td className="p-3 font-bold text-slate-900">{notification.memberName}</td>
                                <td className="p-3 text-slate-800">{notification.deskName}</td>
                                <td className="p-3 font-mono text-slate-800">{notification.dutyDate}</td>
                                <td className="p-3 text-center font-bold text-rose-700">{notification.failureCount}</td>
                                <td className="p-3 text-rose-800 max-w-md break-words">{notification.lastError || 'No error detail was recorded.'}</td>
                                <td className="p-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRetryDutyNotificationFailure(notification)}
                                    disabled={retryingDutyNotificationId === notification.id}
                                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500 hover:bg-amber-400 disabled:bg-slate-300 text-slate-950 disabled:text-slate-500 cursor-pointer disabled:cursor-not-allowed"
                                  >
                                    {retryingDutyNotificationId === notification.id ? 'Retrying…' : 'Retry Email'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* SUBTAB: STATUTORY HOLIDAYS (Registrar-only) */}
                {registrarSubTab === 'statutory-holidays' && currentUser.role === 'Registrar' && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">Statutory Holidays</h3>
                      <p className="text-xs text-slate-500 mt-1">All recurring slots on these dates are closed by default. A Registrar or Desk Admin can untick Holiday on an individual calendar slot where a desk will operate.</p>
                    </div>

                    <form onSubmit={handleSaveStatutoryHoliday} className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3 items-end">
                      <div>
                        <label className="block font-bold text-slate-700 text-xs mb-1">Date</label>
                        <input type="date" required value={holidayForm.date} onChange={(event) => setHolidayForm(previous => ({ ...previous, date: event.target.value }))} className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white" />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 text-xs mb-1">Description</label>
                        <input type="text" required value={holidayForm.description} onChange={(event) => setHolidayForm(previous => ({ ...previous, description: event.target.value }))} placeholder="e.g. Christmas Day" className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white" />
                      </div>
                      <div className="flex gap-2">
                        {editingStatutoryHolidayId && (
                          <button type="button" onClick={() => { setHolidayForm({ date: '', description: '' }); setEditingStatutoryHolidayId(null); }} className="px-3 py-2 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer">Cancel</button>
                        )}
                        <button type="submit" className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-amber-400 shadow cursor-pointer">{editingStatutoryHolidayId ? 'Save Changes' : 'Add Holiday'}</button>
                      </div>
                    </form>

                    {statutoryHolidays.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-400 italic border border-dashed border-slate-300 rounded-xl">No statutory holidays have been added yet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 uppercase font-black tracking-wider border-b border-slate-200">
                              <th className="p-3">Date</th>
                              <th className="p-3">Description</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {statutoryHolidays.map(holiday => (
                              <tr key={holiday.id} className="hover:bg-slate-50">
                                <td className="p-3 font-mono font-bold text-slate-900">{holiday.date}</td>
                                <td className="p-3 font-bold text-slate-800">{holiday.description}</td>
                                <td className="p-3 text-right space-x-1">
                                  <button type="button" onClick={() => handleEditStatutoryHoliday(holiday)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer" title="Change statutory holiday"><Edit2 className="w-3.5 h-3.5" /></button>
                                  <button type="button" onClick={() => handleDeleteStatutoryHoliday(holiday)} className="p-1.5 bg-rose-50 hover:bg-rose-100 rounded text-rose-700 cursor-pointer" title="Delete statutory holiday"><Trash2 className="w-3.5 h-3.5" /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* SUBTAB 2: SLOT TEMPLATES MANAGEMENT */}
                {registrarSubTab === 'slots' && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">Service Desk Shift Slot Templates</h3>
                        <p className="text-xs text-slate-500">Create, edit, activate, or delete recurring weekly shift slots across all desks.</p>
                      </div>
                      <button onClick={() => handleOpenAddSlotModal()} className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold shadow flex items-center space-x-1 cursor-pointer">
                        <Plus className="w-4 h-4" />
                        <span>Create New Shift Slot</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 uppercase font-black tracking-wider border-b border-slate-200">
                            <th className="p-3">Desk [Code]</th>
                            <th className="p-3">Day of Week</th>
                            <th className="p-3">Shift Hours</th>
                            <th className="p-3 text-center">Min / Target / Max JPs</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {slotTemplates.map(slot => {
                            const desk = activeDeskMap[slot.deskId] || {};
                            return (
                              <tr key={slot.id} className="hover:bg-slate-50 transition">
                                <td className="p-3 font-bold text-slate-900">
                                  <span className="bg-slate-900 text-amber-400 text-[10px] px-1.5 py-0.5 rounded font-black mr-1">{desk.code || 'JP'}</span>
                                  <span>{desk.name || slot.deskId}</span>
                                </td>
                                <td className="p-3 font-bold text-slate-900">{slot.dayOfWeek}</td>
                                <td className="p-3 font-mono text-slate-700">{slot.startTime} - {slot.endTime}</td>
                                <td className="p-3 text-center font-bold text-slate-800">
                                  {slot.minJps} / <span className="text-amber-600 font-extrabold">{slot.targetJps}</span> / {slot.maxJps}
                                </td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${slot.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                                    {slot.status}
                                  </span>
                                </td>
                                <td className="p-3 text-right space-x-1">
                                  <button onClick={() => handleOpenEditSlotModal(slot)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer" title="Edit Shift Slot">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setPendingDeleteSlotId(slot.id)} className="p-1.5 bg-rose-50 hover:bg-rose-100 rounded text-rose-700 cursor-pointer" title="Delete Shift Slot">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SUBTAB 3: REGIONS MANAGEMENT */}
                {registrarSubTab === 'regions' && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-slate-900 text-base">Master Association Regions & Attached Desks</h3>
                      <button onClick={handleOpenAddRegionModal} className="bg-slate-900 hover:bg-slate-800 text-amber-400 px-4 py-2 rounded-lg text-xs font-bold shadow flex items-center space-x-1 cursor-pointer">
                        <Plus className="w-4 h-4" />
                        <span>Add New Region</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {regions.map(r => {
                        const attachedDesks = serviceDesks.filter(d => d.region === r.name && d.status === 'Active');

                        return (
                          <div key={r.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3">
                            <div className="space-y-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="bg-slate-900 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded uppercase">{r.code}</span>
                                  <h4 className="font-bold text-base text-slate-900 mt-1">{r.name}</h4>
                                </div>
                                <div className="flex space-x-1">
                                  <button onClick={() => handleOpenEditRegionModal(r)} className="p-1.5 bg-white hover:bg-slate-200 rounded border text-slate-700 shadow-xs cursor-pointer" title="Edit Region">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setPendingDeleteRegionId(r.id)} className="p-1.5 bg-white hover:bg-rose-100 rounded border text-rose-700 shadow-xs cursor-pointer" title="Delete Region">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="pt-3 border-t border-slate-200 space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                  <span className="flex items-center space-x-1">
                                    <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <span>Attached Service Desks</span>
                                  </span>
                                  <span className="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                    {attachedDesks.length}
                                  </span>
                                </div>

                                <div className="bg-white rounded-lg border border-slate-200 p-2 space-y-1.5 max-h-48 overflow-y-auto">
                                  {attachedDesks.length === 0 ? (
                                    <div className="text-[11px] text-slate-400 italic py-2 text-center">
                                      No service desks attached to this region
                                    </div>
                                  ) : (
                                    attachedDesks.map(d => (
                                      <div key={d.id} className="p-2 bg-slate-50 rounded border border-slate-100 space-y-0.5">
                                        <div className="flex items-center space-x-1.5 font-bold text-xs text-slate-900">
                                          <span className="bg-slate-900 text-amber-400 text-[9px] px-1.5 py-0.2 font-mono rounded">
                                            {d.code || 'JP'}
                                          </span>
                                          <span className="truncate">{d.name}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 truncate flex items-center space-x-1 pl-0.5">
                                          <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                                          <span className="truncate">{d.address}</span>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 6: USER SENSITIVE HELP TAB */}
            {activeTab === 'help' && currentUser && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
                <div className="border-b border-slate-200 pb-4 flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="bg-amber-500 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded uppercase tracking-wider">
                        Role Guidelines: {currentUser.role}
                      </span>
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-900 mt-1">Portal User Guidelines & Step-by-Step Instructions</h2>
                  </div>
                  <div className="text-xs text-slate-500 font-bold bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                    Logged in as: <span className="text-slate-900 font-black">{currentUser.fullName}</span> ({currentUser.warrantNumber})
                  </div>
                </div>

                <div className="space-y-6 text-xs text-slate-700">
                  <div className="space-y-4">
                    <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide border-b border-amber-200 pb-1 text-amber-800">
                      JP Member Core Instructions
                    </h3>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                        <UserPlus className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>1. Account Sign-Up & Login</span>
                      </h4>
                      <ul className="list-disc pl-5 space-y-1 font-medium leading-relaxed">
                        <li>New members click <b>"Click here to Sign up"</b> on the login screen to register warrant details. Enter the password twice; the application will not accept it unless the two entries match.</li>
                        <li>Accounts start as <b>Pending</b> until an AJPA Registrar verifies credentials. Once approved, log in with your email and password.</li>
                        <li>Use the eye icon to show or hide a password while entering it. If you forget your password, select <b>"Forgot password?"</b>, enter your registered email address, and follow the reset link sent to that address.</li>
                        <li><b>My Profile:</b> update your email address, mobile phone, and warrant number. Your name, role, and account status are displayed for reference; role changes are maintained by a Registrar.</li>
                      </ul>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                        <Filter className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>2. Navigation & Calendar Filters</span>
                      </h4>
                      <ul className="list-disc pl-5 space-y-1 font-medium leading-relaxed">
                        <li><b>Calendar ({calendarDisplayWeeks} Wks):</b> Displays recurring shift slots for your selected rolling window. Choose 4 to 20 weeks in <b>My Profile</b>; the calendar automatically rolls over after midnight Sunday night.</li>
                        <li>The three compact filter rows show your current selections. Click <b>Location &amp; desks</b>, <b>Shift time</b>, or <b>Days</b> to expand and change that group.</li>
                        <li><b>Location &amp; desks:</b> Filter by region. JP Members can tick any combination of followed desks; select <b>All Followed Desks</b> to tick every desk they follow.</li>
                        <li><b>Days:</b> Select the days of the week you want to see. Use <b>Select all days</b> to restore the full week.</li>
                        <li>
                          <b>Shift time:</b> Use the checkboxes to filter visible shifts by time of day:
                          <ul className="list-circle pl-5 mt-1 space-y-0.5 text-slate-600">
                            <li><b>Morning:</b> Shifts starting between Midnight (00:00) and Midday (11:59).</li>
                            <li><b>Afternoon:</b> Shifts starting between Midday (12:00) and 4:59 PM (16:59).</li>
                            <li><b>Evening:</b> Shifts starting between 5:00 PM (17:00) and Midnight (23:59).</li>
                            <li><i>All three options are selected by default.</i></li>
                          </ul>
                        </li>
                        <li><b>Past shifts:</b> If a selected shift has already ended, a confirmation appears before it is registered or withdrawn. These are one-off historical changes only: they do not create a recurring rule, calendar appointment, or email notification.</li>
                      </ul>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                        <Star className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>3. How to Follow Service Desks</span>
                      </h4>
                      <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                        <li>Navigate to the <b>Service Desks</b> tab.</li>
                        <li>Locate your preferred desk tile (e.g. <i>Remuera Library</i>).</li>
                        <li>Click the <b>"+ Follow"</b> button. It will change to <b>"★ Following"</b>.</li>
                        <li>Open <b>Calendar ({calendarDisplayWeeks} Wks) &rarr; Location &amp; desks</b> to choose which of your followed desks are currently displayed.</li>
                      </ol>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                        <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>4. How to Register for & Withdraw from Shifts</span>
                      </h4>
                      <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                        <li>
                          <b>Register Options:</b> Clicking <b>Register</b> on a shift opens a popup window with four options:
                          <ul className="list-circle pl-5 mt-1 space-y-1 text-slate-600">
                            <li><b>1. Just this slot:</b> Registers you for only the single selected shift slot occurrence.</li>
                            <li><b>2. Next n slots where n is entered:</b> Registers you for <i>n</i> consecutive occurrences of that shift slot starting from the selected date.</li>
                            <li><b>3. Slots until and including dd/mm/yyyy:</b> Registers you for all recurring occurrences of that shift slot up to and including the date selected from the calendar drop down.</li>
                            <li><b>4. All future slots:</b> Registers you for all future recurring occurrences of that shift slot.</li>
                          </ul>
                        </li>
                        <li>
                          <b>Withdraw Options:</b> Clicking <b>Withdraw</b> on a registered shift opens a popup window with four matching options:
                          <ul className="list-circle pl-5 mt-1 space-y-1 text-slate-600">
                            <li><b>1. Just this slot:</b> Withdraws your registration for only the single selected shift slot.</li>
                            <li><b>2. Next n slots:</b> Withdraws your registration for <i>n</i> consecutive occurrences starting from the selected date.</li>
                            <li><b>3. All slots up until and including dd/mm/yyyy:</b> Withdraws your registration for all occurrences of that shift slot up to and including the selected date.</li>
                            <li><b>4. All future slots registered:</b> Withdraws your registration from all future recurring occurrences of that shift slot.</li>
                          </ul>
                        </li>
                        <li>
                          <b>Automatic Calendar Rollover Logic:</b> When your rolling calendar rolls over at midnight Sunday night, cases configured with <i>Next n slots</i>, <i>Slots until and including dd/mm/yyyy</i>, and <i>All future slots</i> will automatically register or withdraw you for the newly rolled-in slots according to your rule logic.
                        </li>
                        <li>
                          <b>My Shifts:</b> Use the <b>Date</b> and <b>Desk</b> filters to review your registered shifts across past, current, or future timeframes. <b>Log Stats</b> becomes available only after the shift has finished. At that point, calendar download and withdrawal are unavailable. Once statistics are logged, the disabled <b>Stats Logged</b> button directs you to the <b>Statistics</b> tab for any maintenance.
                        </li>
                        <li><b>Closed slots:</b> Grey slots marked <b>Desk closed</b> or <b>Statutory holiday</b> cannot be registered for.</li>
                          <li>A registration is saved immediately. If you remain registered for approximately five minutes, you will receive a confirmation email with a calendar appointment attachment. If you withdraw after that email, you will receive a cancellation email; delete any personal calendar appointment yourself, because the portal cannot remove it. You can also click <b>"Add to Cal"</b> on any registered shift to download an <code className="bg-white px-1 border rounded">.ics</code> calendar file for Outlook, Google, or Apple Calendar.</li>
                      </ol>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                        <BarChart2 className="w-4 h-4 text-purple-600 shrink-0" />
                        <span>5. How to Add & Maintain Shift Statistics</span>
                      </h4>
                      <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                        <li>After completing a duty shift, click <b>"Log Stats"</b> on the shift tile or in the <b>My Shifts</b> tab.</li>
                        <li>Enter clients served, hours worked, and document counts (Certified Copies, Statutory Declarations, Witnessed Signatures, Affidavits, Other). <b>JP Duties</b> is calculated automatically as one duty for every two hours, or part thereof, and cannot be edited.</li>
                        <li>Click <b>"Save Statistics Log"</b>.</li>
                        <li>To edit or delete an existing log, go to the <b>Statistics</b> tab, click on any row in the table, update the values, and click <b>"Save Changes"</b> or <b>"Delete Entry"</b>.</li>
                      </ol>
                    </div>
                  </div>

                  {(currentUser.role === 'Admin' || currentUser.role === 'Registrar') && (
                    <div className="space-y-4 pt-4 border-t border-slate-200">
                      <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide border-b border-sky-200 pb-1 text-sky-800 flex items-center space-x-2">
                        <Shield className="w-4 h-4 text-sky-600" />
                        <span>Desk Admin Guidelines</span>
                      </h3>

                      <div className="bg-sky-50/60 p-4 rounded-xl border border-sky-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <Building2 className="w-4 h-4 text-sky-700 shrink-0" />
                          <span>1. How to Add & Maintain Service Desks</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>In the <b>Service Desks</b> tab, click <b>"Create Service Desk"</b> to add a new physical location.</li>
                          <li>Fill in desk code (2 letters), name, address, region, primary/secondary desk admins, and facility site contact details.</li>
                          <li>Click <b>"Maintain Desk"</b> on any desk card to update governance fields or operational instructions.</li>
                          <li>Click <b>"Delete Desk"</b> to archive a desk location and suspend its active calendar shifts.</li>
                        </ol>
                      </div>

                      <div className="bg-sky-50/60 p-4 rounded-xl border border-sky-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <Ban className="w-4 h-4 text-sky-700 shrink-0" />
                          <span>3. How to Close or Reopen an Individual Desk Slot</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>Open the relevant slot from the <b>Calendar</b>.</li>
                          <li>Use the <b>Holiday / Desk closed</b> tick box to close that desk’s slot for that date. The slot will turn grey and cannot be registered for.</li>
                          <li>Untick it to reopen that individual slot. This is useful where one desk operates on a statutory holiday or needs to reopen after a local closure.</li>
                        </ol>
                      </div>

                      <div className="bg-sky-50/60 p-4 rounded-xl border border-sky-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-sky-700 shrink-0" />
                          <span>2. How to Add & Maintain Recurring Shift Slots</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>Click <b>"Create Slot"</b> on the relevant service desk card.</li>
                          <li>Select day of week, start time, end time, and capacity limits (<i>Min JPs ≤ Target JPs ≤ Max JPs</i>). A desk may have more than one slot on the same day, provided each slot has its own start and end time.</li>
                          <li>To edit or remove a slot, click its tile under the relevant service desk. JP Members can view these slot details but cannot change them.</li>
                        </ol>
                      </div>

                      <div className="bg-sky-50/60 p-4 rounded-xl border border-sky-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <Download className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span>4. How to Download Desk Statistics</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>Navigate to the <b>Statistics</b> tab.</li>
                          <li>Use the filters (Date Range, Region, Desk, JP Member) to customize your dataset.</li>
                          <li>Click <b>"Download Filtered CSV"</b> at the top right to download a spreadsheet report.</li>
                        </ol>
                      </div>

                      <div className="bg-sky-50/60 p-4 rounded-xl border border-sky-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <Mail className="w-4 h-4 text-sky-700 shrink-0" />
                          <span>5. Desk Admin roster reminders</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>Open <b>My Profile</b> and select weekly, fortnightly, or no reminders.</li>
                          <li>For weekly or fortnightly reminders, choose the first reminder date and the number of weeks ahead to report on.</li>
                          <li>On each scheduled date, an email covers every Primary and Secondary desk assigned to you, listing slots below their minimum JP requirement or confirming that all open slots meet minimum staffing.</li>
                        </ol>
                      </div>

                      <div className="bg-sky-50/60 p-4 rounded-xl border border-sky-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-sky-700 shrink-0" />
                          <span>6. Activity Audit Log</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>Open <b>Activity Log</b> to review recent shift registrations, withdrawals, and recurring-rule actions.</li>
                          <li>The log records the time, account that performed the action, affected JP, service desk, and relevant shift or rule details.</li>
                          <li>It is view-only and available only to Desk Admins and Registrars. It records activity from the time the audit feature was enabled.</li>
                        </ol>
                      </div>
                    </div>
                  )}

                  {currentUser.role === 'Registrar' && (
                    <div className="space-y-4 pt-4 border-t border-slate-200">
                      <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide border-b border-purple-200 pb-1 text-purple-900 flex items-center space-x-2">
                        <Award className="w-4 h-4 text-purple-700" />
                        <span>Registrar Governance Guidelines</span>
                      </h3>

                      <div className="bg-purple-50/60 p-4 rounded-xl border border-purple-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <Globe className="w-4 h-4 text-purple-700 shrink-0" />
                          <span>1. How to Add & Maintain Master Regions</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>Navigate to <b>Registrar Portal &rarr; Regions</b>.</li>
                          <li>Click <b>"Add New Region"</b>, type the region name and short code (e.g., <code className="bg-white px-1 border rounded">AKL-E</code>), and click Save.</li>
                          <li>Service desks can then be assigned to this region from the Service Desks tab.</li>
                        </ol>
                      </div>

                      <div className="bg-purple-50/60 p-4 rounded-xl border border-purple-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-purple-700 shrink-0" />
                          <span>3. How to Maintain Statutory Holidays</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>Navigate to <b>Registrar Portal &rarr; Statutory Holidays</b>.</li>
                          <li>Add the date and description, then click <b>Add Holiday</b>. All slots on that date will be closed by default.</li>
                          <li>Use the edit or delete icons to change or remove a statutory holiday. Desk Admins can only reopen individual desk slots; they cannot change the statutory-holiday list.</li>
                        </ol>
                      </div>

                      <div className="bg-purple-50/60 p-4 rounded-xl border border-purple-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <Users className="w-4 h-4 text-purple-700 shrink-0" />
                          <span>2. How to Approve Sign-Ups & Maintain JP Members</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>Navigate to <b>Registrar Portal &rarr; JP Members</b>.</li>
                          <li>Review new member registrations in the <b>Pending Approval</b> queue.</li>
                          <li>Click <b>"Approve"</b> to activate their account or <b>"Reject"</b> to deny access. Approval sends the new member an automated welcome email with the JP Member guidance.</li>
                          <li>Use the Active, Rejected, Archived, and All filters together with Search to locate a member by name, warrant number, email address, or phone number.</li>
                          <li>Click the edit icon next to any member to update warrant numbers, system roles (Member, Admin, Registrar), or provisional status.</li>
                          <li>Archive a former member to disable sign-in while retaining their profile, historical statistics, and Activity Log references. A member assigned as a Primary or Secondary Desk Admin must be reassigned or cleared from those desks before they can be archived. Archived members can be restored.</li>
                        </ol>
                      </div>

                      <div className="bg-purple-50/60 p-4 rounded-xl border border-purple-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <Database className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span>4. How to Download Master System Data Archives</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>Go to <b>Registrar Portal</b> and click <b>"Download Data (CSV Archive)"</b>.</li>
                          <li>Confirm the action in the prompt modal window.</li>
                          <li>The system will automatically generate and download <b>8 separate timestamped CSV files</b>, including statutory-holiday dates and desk-slot closure overrides.</li>
                        </ol>
                      </div>

                      <div className="bg-purple-50/60 p-4 rounded-xl border border-purple-200 space-y-2">
                        <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                          <Mail className="w-4 h-4 text-purple-700 shrink-0" />
                          <span>5. Monitor & Retry Failed Duty Emails</span>
                        </h4>
                        <ol className="list-decimal pl-5 space-y-1 font-medium leading-relaxed">
                          <li>Go to <b>Registrar Portal &rarr; Email Delivery</b>. Operational Health shows scheduled-process status and counts for waiting or failed duty emails and Desk Admin reminders.</li>
                          <li>The failed-duty-email list is empty unless an email has failed all five automatic delivery attempts.</li>
                          <li>Read the error detail and correct the cause first — for example, a Resend sender-domain or email-address issue.</li>
                          <li>Use <b>Retry Email</b> to return the item to the secure delivery queue. The system checks that the booking still exists before a confirmation email is sent.</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* --- SHIFT REGISTRATION OPTIONS MODAL --- */}
      {pastRegistrationConfirmationOcc && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-amber-200">
            <div className="flex items-start space-x-3 border-b border-slate-100 pb-3">
              <div className="p-2 rounded-full bg-amber-100 text-amber-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-black text-amber-700 uppercase tracking-wider">Past shift</p>
                <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">Register a completed slot?</h3>
              </div>
            </div>
            <div className="text-sm text-slate-700 leading-relaxed space-y-2">
              <p>This slot has already happened:</p>
              <p className="font-bold text-slate-900">
                {activeDeskMap[pastRegistrationConfirmationOcc.deskId]?.name}<br />
                {pastRegistrationConfirmationOcc.fullDayName}, {pastRegistrationConfirmationOcc.formattedDate} ({pastRegistrationConfirmationOcc.startTime} - {pastRegistrationConfirmationOcc.endTime})
              </p>
              <p>Choose <b>OK, Register</b> to record this past duty. It will be registered only for this one slot and will not send a calendar appointment or email.</p>
            </div>
            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPastRegistrationConfirmationOcc(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPastRegistration}
                className="px-5 py-2 rounded-lg text-xs font-extrabold bg-slate-900 text-amber-400 hover:bg-slate-800 shadow cursor-pointer"
              >
                OK, Register
              </button>
            </div>
          </div>
        </div>
      )}

      {pastWithdrawalConfirmationOcc && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-amber-200">
            <div className="flex items-start space-x-3 border-b border-slate-100 pb-3">
              <div className="p-2 rounded-full bg-amber-100 text-amber-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-black text-amber-700 uppercase tracking-wider">Past shift</p>
                <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">Withdraw from a completed slot?</h3>
              </div>
            </div>
            <div className="text-sm text-slate-700 leading-relaxed space-y-2">
              <p>This slot has already happened:</p>
              <p className="font-bold text-slate-900">
                {activeDeskMap[pastWithdrawalConfirmationOcc.deskId]?.name}<br />
                {pastWithdrawalConfirmationOcc.fullDayName}, {pastWithdrawalConfirmationOcc.formattedDate} ({pastWithdrawalConfirmationOcc.startTime} - {pastWithdrawalConfirmationOcc.endTime})
              </p>
              <p>Choose <b>OK, Withdraw</b> to remove this one past registration. This will not alter any other shift or send a cancellation email.</p>
            </div>
            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPastWithdrawalConfirmationOcc(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPastWithdrawal}
                className="px-5 py-2 rounded-lg text-xs font-extrabold bg-rose-600 text-white hover:bg-rose-700 shadow cursor-pointer"
              >
                OK, Withdraw
              </button>
            </div>
          </div>
        </div>
      )}

      {registerModalOcc && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="bg-slate-900 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded uppercase mr-2">
                  {activeDeskMap[registerModalOcc.deskId]?.code || 'JP'}
                </span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Registration Options</span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">{activeDeskMap[registerModalOcc.deskId]?.name}</h3>
                <p className="text-xs text-slate-600 font-semibold mt-0.5">
                  📅 {registerModalOcc.fullDayName}, {registerModalOcc.formattedDate} ({registerModalOcc.startTime} - {registerModalOcc.endTime})
                </p>
              </div>
              <button onClick={() => setRegisterModalOcc(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-bold text-slate-800">Select Registration Scope:</label>

              <div className="space-y-2">
                <label className="flex items-center space-x-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                  <input 
                    type="radio" 
                    name="regOpt" 
                    value="SINGLE" 
                    checked={registerOption === 'SINGLE'} 
                    onChange={() => setRegisterOption('SINGLE')} 
                    className="text-amber-500 focus:ring-amber-400 cursor-pointer"
                  />
                  <span className="font-bold text-slate-800">1. Just this slot</span>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                  <input 
                    type="radio" 
                    name="regOpt" 
                    value="NEXT_N" 
                    checked={registerOption === 'NEXT_N'} 
                    onChange={() => setRegisterOption('NEXT_N')} 
                    className="text-amber-500 focus:ring-amber-400 cursor-pointer"
                  />
                  <div className="flex items-center space-x-2 flex-1">
                    <span className="font-bold text-slate-800">2. Next</span>
                    <input 
                      type="number" 
                      min="1" 
                      max="52"
                      value={registerCountN} 
                      onChange={(e) => setRegisterCountN(e.target.value)} 
                      onClick={() => setRegisterOption('NEXT_N')}
                      className="w-16 border rounded p-1 text-center font-bold bg-white"
                    />
                    <span className="font-bold text-slate-800">slots</span>
                  </div>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                  <input 
                    type="radio" 
                    name="regOpt" 
                    value="UNTIL_DATE" 
                    checked={registerOption === 'UNTIL_DATE'} 
                    onChange={() => setRegisterOption('UNTIL_DATE')} 
                    className="text-amber-500 focus:ring-amber-400 cursor-pointer"
                  />
                  <div className="flex items-center space-x-2 flex-1">
                    <span className="font-bold text-slate-800">3. Slots until and including</span>
                    <input 
                      type="date" 
                      value={registerUntilDate} 
                      onChange={(e) => setRegisterUntilDate(e.target.value)} 
                      onClick={() => setRegisterOption('UNTIL_DATE')}
                      className="border rounded p-1 font-bold bg-white text-xs"
                    />
                  </div>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                  <input 
                    type="radio" 
                    name="regOpt" 
                    value="ALL_FUTURE" 
                    checked={registerOption === 'ALL_FUTURE'} 
                    onChange={() => setRegisterOption('ALL_FUTURE')} 
                    className="text-amber-500 focus:ring-amber-400 cursor-pointer"
                  />
                  <span className="font-bold text-slate-800">4. All future slots</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setRegisterModalOcc(null)} 
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleExecuteRegister} 
                className="px-5 py-2 rounded-lg text-xs font-extrabold bg-slate-900 text-amber-400 hover:bg-slate-800 shadow cursor-pointer"
              >
                Confirm Registration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SHIFT WITHDRAWAL OPTIONS MODAL --- */}
      {withdrawModalOcc && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="bg-slate-900 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded uppercase mr-2">
                  {activeDeskMap[withdrawModalOcc.deskId]?.code || 'JP'}
                </span>
                <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Withdrawal Options</span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">{activeDeskMap[withdrawModalOcc.deskId]?.name}</h3>
                <p className="text-xs text-slate-600 font-semibold mt-0.5">
                  📅 {withdrawModalOcc.fullDayName}, {withdrawModalOcc.formattedDate} ({withdrawModalOcc.startTime} - {withdrawModalOcc.endTime})
                </p>
              </div>
              <button onClick={() => setWithdrawModalOcc(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-bold text-slate-800">Select Withdrawal Scope:</label>

              <div className="space-y-2">
                <label className="flex items-center space-x-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                  <input 
                    type="radio" 
                    name="withOpt" 
                    value="SINGLE" 
                    checked={withdrawOption === 'SINGLE'} 
                    onChange={() => setWithdrawOption('SINGLE')} 
                    className="text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <span className="font-bold text-slate-800">1. Just this slot</span>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                  <input 
                    type="radio" 
                    name="withOpt" 
                    value="NEXT_N" 
                    checked={withdrawOption === 'NEXT_N'} 
                    onChange={() => setWithdrawOption('NEXT_N')} 
                    className="text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <div className="flex items-center space-x-2 flex-1">
                    <span className="font-bold text-slate-800">2. Next</span>
                    <input 
                      type="number" 
                      min="1" 
                      max="52"
                      value={withdrawCountN} 
                      onChange={(e) => setWithdrawCountN(e.target.value)} 
                      onClick={() => setWithdrawOption('NEXT_N')}
                      className="w-16 border rounded p-1 text-center font-bold bg-white"
                    />
                    <span className="font-bold text-slate-800">slots</span>
                  </div>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                  <input 
                    type="radio" 
                    name="withOpt" 
                    value="UNTIL_DATE" 
                    checked={withdrawOption === 'UNTIL_DATE'} 
                    onChange={() => setWithdrawOption('UNTIL_DATE')} 
                    className="text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <div className="flex items-center space-x-2 flex-1">
                    <span className="font-bold text-slate-800">3. All slots up until and including</span>
                    <input 
                      type="date" 
                      value={withdrawUntilDate} 
                      onChange={(e) => setWithdrawUntilDate(e.target.value)} 
                      onClick={() => setWithdrawOption('UNTIL_DATE')}
                      className="border rounded p-1 font-bold bg-white text-xs"
                    />
                  </div>
                </label>

                <label className="flex items-center space-x-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
                  <input 
                    type="radio" 
                    name="withOpt" 
                    value="ALL_FUTURE" 
                    checked={withdrawOption === 'ALL_FUTURE'} 
                    onChange={() => setWithdrawOption('ALL_FUTURE')} 
                    className="text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <span className="font-bold text-slate-800">4. All future slots registered</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setWithdrawModalOcc(null)} 
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleExecuteWithdraw} 
                className="px-5 py-2 rounded-lg text-xs font-extrabold bg-rose-600 text-white hover:bg-rose-700 shadow cursor-pointer"
              >
                Confirm Withdrawal
              </button>
            </div>
          </div>
        </div>
      )}

      {myShiftsCustomModalOpen && (
        <CustomDateRangeModal
          applyLabel="Apply Custom Range"
          fromDate={myShiftsCustomFrom}
          onClose={() => setMyShiftsCustomModalOpen(false)}
          onApply={({ fromDate, toDate }) => {
            setMyShiftsCustomFrom(fromDate);
            setMyShiftsCustomTo(toDate);
            setMyShiftsCustomModalOpen(false);
          }}
          title="Interrogate My Shifts (Custom Date Range)"
          toDate={myShiftsCustomTo}
        />
      )}

      {deskMaintenanceCustomModalOpen && (
        <CustomDateRangeModal
          applyLabel="Apply Custom Range"
          fromDate={deskMaintenanceCustomFrom}
          onClose={() => setDeskMaintenanceCustomModalOpen(false)}
          onApply={({ fromDate, toDate }) => {
            setDeskMaintenanceCustomFrom(fromDate);
            setDeskMaintenanceCustomTo(toDate);
            setDeskMaintenanceCustomModalOpen(false);
          }}
          title="Interrogate Desk Maintenance (Custom Date Range)"
          toDate={deskMaintenanceCustomTo}
        />
      )}

      {/* --- MASTER SYSTEM DATA CSV EXPORT CONFIRMATION MODAL --- */}
      {confirmDownloadModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center space-x-3 text-slate-900 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Confirm Master Data Download</h3>
                <p className="text-[11px] text-slate-500">8 System CSV Archives</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to download all existing application data? This will generate <b>8 timestamped CSV files</b> corresponding to all core datasets:
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] font-mono space-y-1 text-slate-700">
              <div className="flex justify-between"><span>1. INITIAL_REGIONS</span><span className="font-bold text-emerald-700">[Suffix _1.csv]</span></div>
              <div className="flex justify-between"><span>2. INITIAL_USERS</span><span className="font-bold text-emerald-700">[Suffix _2.csv]</span></div>
              <div className="flex justify-between"><span>3. INITIAL_SERVICE_DESKS</span><span className="font-bold text-emerald-700">[Suffix _3.csv]</span></div>
              <div className="flex justify-between"><span>4. INITIAL_SLOT_TEMPLATES</span><span className="font-bold text-emerald-700">[Suffix _4.csv]</span></div>
              <div className="flex justify-between"><span>5. INITIAL_ASSIGNMENTS</span><span className="font-bold text-emerald-700">[Suffix _5.csv]</span></div>
              <div className="flex justify-between"><span>6. INITIAL_LOGGED_STATISTICS</span><span className="font-bold text-emerald-700">[Suffix _6.csv]</span></div>
              <div className="flex justify-between"><span>7. STATUTORY_HOLIDAYS</span><span className="font-bold text-emerald-700">[Suffix _7.csv]</span></div>
              <div className="flex justify-between"><span>8. DUTY_SLOT_HOLIDAY_OVERRIDES</span><span className="font-bold text-emerald-700">[Suffix _8.csv]</span></div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button 
                type="button"
                onClick={() => setConfirmDownloadModalOpen(false)} 
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleExecuteFullDataDownload} 
                className="px-5 py-2 rounded-lg text-xs font-black bg-emerald-700 hover:bg-emerald-600 text-white shadow-md transition cursor-pointer flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Proceed with Download</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD / EDIT SHIFT SLOT TEMPLATE MODAL WITH CLIENT-SIDE VALIDATION & WARNINGS --- */}
      {slotModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {!canManage ? 'Shift Slot Details' : editingSlotId ? 'Edit Shift Slot Template' : 'Create New Shift Slot Template'}
              </h3>
              <button onClick={() => canManage ? handlePromptCancelSlot() : setSlotModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            {canManage && (slotValidationError || activeSlotValidationError) && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs font-bold flex items-start space-x-2 animate-pulse">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold uppercase tracking-wider block text-[10px] text-rose-900">Data Validation Warning</span>
                  <span>{slotValidationError || activeSlotValidationError}</span>
                </div>
              </div>
            )}

            <form onSubmit={handlePromptSaveSlot} className="space-y-3 text-xs">
              {!canManage && (
                <p className="bg-slate-100 border border-slate-200 text-slate-600 p-3 rounded-lg font-medium">
                  This is a view-only summary. Only Desk Admins and Registrars can change slot settings.
                </p>
              )}
              <fieldset disabled={!canManage} className={!canManage ? 'space-y-3 opacity-75' : 'space-y-3'}>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Service Desk</label>
                <select 
                  value={slotForm.deskId} 
                  onChange={(e) => setSlotForm(prev => ({ ...prev, deskId: e.target.value }))} 
                  className="w-full border rounded p-2 font-bold text-slate-900 bg-white"
                >
                  {activeDesksList.map(d => (
                    <option key={d.id} value={d.id}>[{d.code}] {d.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Day of Week</label>
                  <select 
                    value={slotForm.dayOfWeek} 
                    onChange={(e) => setSlotForm(prev => ({ ...prev, dayOfWeek: e.target.value }))} 
                    className="w-full border rounded p-2 font-bold bg-white"
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Time</label>
                  <input 
                    type="time" 
                    required 
                    value={slotForm.startTime} 
                    onChange={(e) => setSlotForm(prev => ({ ...prev, startTime: e.target.value }))} 
                    className={`w-full border rounded p-2 font-bold bg-white ${
                      slotForm.startTime && slotForm.endTime && slotForm.startTime >= slotForm.endTime ? 'border-rose-500 bg-rose-50' : ''
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Time</label>
                  <input 
                    type="time" 
                    required 
                    value={slotForm.endTime} 
                    onChange={(e) => setSlotForm(prev => ({ ...prev, endTime: e.target.value }))} 
                    className={`w-full border rounded p-2 font-bold bg-white ${
                      slotForm.startTime && slotForm.endTime && slotForm.startTime >= slotForm.endTime ? 'border-rose-500 bg-rose-50' : ''
                    }`}
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[10px]">
                    JP Capacity Limits & Rules
                  </span>
                  <span className="font-bold text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                    Rule: Min JPs ≤ Target JPs ≤ Max JPs
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Min JPs Required</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="10" 
                      required 
                      value={slotForm.minJps} 
                      onChange={(e) => setSlotForm(prev => ({ ...prev, minJps: parseInt(e.target.value, 10) || 1 }))} 
                      className={`w-full border rounded p-2 font-bold bg-white ${
                        slotForm.minJps > slotForm.targetJps ? 'border-rose-500 bg-rose-50 text-rose-900' : ''
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Target JPs</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="10" 
                      required 
                      value={slotForm.targetJps} 
                      onChange={(e) => setSlotForm(prev => ({ ...prev, targetJps: parseInt(e.target.value, 10) || 1 }))} 
                      className={`w-full border rounded p-2 font-bold bg-white ${
                        slotForm.minJps > slotForm.targetJps || slotForm.targetJps > slotForm.maxJps ? 'border-rose-500 bg-rose-50 text-rose-900' : ''
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Max JPs Capacity</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="10" 
                      required 
                      value={slotForm.maxJps} 
                      onChange={(e) => setSlotForm(prev => ({ ...prev, maxJps: parseInt(e.target.value, 10) || 1 }))} 
                      className={`w-full border rounded p-2 font-bold bg-white ${
                        slotForm.targetJps > slotForm.maxJps ? 'border-rose-500 bg-rose-50 text-rose-900' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Effective From Date</label>
                  <input 
                    type="date" 
                    required 
                    value={slotForm.effectiveFromDate} 
                    onChange={(e) => setSlotForm(prev => ({ ...prev, effectiveFromDate: e.target.value }))} 
                    className="w-full border rounded p-2 font-bold bg-white" 
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Slot Status</label>
                  <select 
                    value={slotForm.status} 
                    onChange={(e) => setSlotForm(prev => ({ ...prev, status: e.target.value }))} 
                    className="w-full border rounded p-2 font-bold text-slate-900 bg-white"
                  >
                    <option value="Active">Active (Rostered)</option>
                    <option value="Inactive">Inactive (Suspended)</option>
                  </select>
                </div>
              </div>
              </fieldset>

              <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                {canManage && editingSlotId ? (
                  <button 
                    type="button" 
                    onClick={handlePromptDeleteSlot} 
                    className="px-4 py-2 rounded-lg font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Slot</span>
                  </button>
                ) : <div />}

                {canManage ? (
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={handlePromptCancelSlot}
                      className="px-4 py-2 rounded-lg font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!!activeSlotValidationError}
                      className={`px-5 py-2 rounded-lg font-bold shadow transition cursor-pointer ${
                        activeSlotValidationError
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
                          : 'bg-slate-900 hover:bg-slate-800 text-amber-400'
                      }`}
                    >
                      Save Changes
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSlotModalOpen(false)}
                    className="px-4 py-2 rounded-lg font-bold bg-slate-900 hover:bg-slate-800 text-amber-400 cursor-pointer"
                  >
                    Close
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      <SlotActionConfirmationDialog
        action={slotActionConfirm}
        onCancel={() => setSlotActionConfirm(null)}
        onConfirm={handleConfirmSlotAction}
      />

      {/* --- EDITING EXISTING STATISTIC RECORD MODAL --- */}
      {editingStatRecord && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-slate-200 my-auto max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Maintain Record</span>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">Edit Service Desk Statistics</h3>
              </div>
              <button onClick={() => setEditingStatRecord(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedStatSubmit} {...statisticsInputSelection} className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 font-semibold text-slate-700">
                <div className="text-slate-900 font-extrabold text-xs sm:text-sm">
                  {editingStatRecord.deskName} [{editingStatRecord.deskCode}]
                </div>
                {editingStatRecord.isHomeBasedService ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Date</label>
                      <input type="date" required value={editStatForm.dutyDate} onChange={(event) => setEditStatForm(previous => ({ ...previous, dutyDate: event.target.value }))} className="w-full border border-slate-300 rounded-lg p-2 bg-white text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Start time</label>
                      <input type="time" required value={editStatForm.startTime} onChange={(event) => setEditStatForm(previous => ({ ...previous, startTime: event.target.value }))} className="w-full border border-slate-300 rounded-lg p-2 bg-white text-sm" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-between text-[11px] text-slate-600">
                    <span>📅 {editingStatRecord.date}</span>
                    <span>⏰ {editingStatRecord.startTime} - {editingStatRecord.endTime}</span>
                  </div>
                )}
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                  JP: <span className="font-bold text-slate-800">{editingStatRecord.jpName}</span> ({editingStatRecord.warrantNumber})
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="block font-bold text-slate-700 mb-1">No. of JP Duties</label>
                  <input 
                    type="number" 
                    min="0"
                    step="1"
                    readOnly
                    value={editStatForm.noOfJpDuties} 
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-500 text-sm bg-slate-200 cursor-not-allowed"
                    title="Calculated automatically: one JP duty for each two hours or part thereof"
                  />
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="block font-bold text-slate-700 mb-1">No. of Clients</label>
                  <input 
                    type="number" 
                    min="0"
                    step="1"
                    required 
                    value={editStatForm.noOfClients} 
                    onChange={(e) => handleEditStatInputChange('noOfClients', e.target.value)} 
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-sm bg-white" 
                  />
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="block font-bold text-slate-700 mb-1">Hours Worked (0.00)</label>
                  <input 
                    type="number" 
                    min="0"
                    step="0.25"
                    required 
                    value={editStatForm.noOfHoursWorked} 
                    onChange={(e) => handleEditStatInputChange('noOfHoursWorked', e.target.value, true)} 
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-sm bg-white" 
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">Document Breakdown</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Certified Copies</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      value={editStatForm.certifiedCopies} 
                      onChange={(e) => handleEditStatInputChange('certifiedCopies', e.target.value)} 
                      className="w-full border rounded p-2 font-bold bg-white" 
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Statutory Declarations</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      value={editStatForm.statutoryDeclarations} 
                      onChange={(e) => handleEditStatInputChange('statutoryDeclarations', e.target.value)} 
                      className="w-full border rounded p-2 font-bold bg-white" 
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Signatures Witnessed</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      value={editStatForm.signatureWitnessed} 
                      onChange={(e) => handleEditStatInputChange('signatureWitnessed', e.target.value)} 
                      className="w-full border rounded p-2 font-bold bg-white" 
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Affidavits</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      value={editStatForm.affidavits} 
                      onChange={(e) => handleEditStatInputChange('affidavits', e.target.value)} 
                      className="w-full border rounded p-2 font-bold bg-white" 
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Other Duties</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      value={editStatForm.other} 
                      onChange={(e) => handleEditStatInputChange('other', e.target.value)} 
                      className="w-full border rounded p-2 font-bold bg-white" 
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Shift Notes</label>
                <textarea 
                  rows={3}
                  value={editStatForm.notes} 
                  onChange={(e) => setEditStatForm(prev => ({ ...prev, notes: e.target.value }))} 
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs" 
                  placeholder="Optional shift notes or observations..."
                />
              </div>

              <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setConfirmDeleteStatId(editingStatRecord.id)} 
                  className="px-4 py-2 rounded-lg font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 cursor-pointer flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Entry</span>
                </button>

                <div className="flex space-x-2">
                  <button 
                    type="button" 
                    onClick={() => setEditingStatRecord(null)} 
                    className="px-4 py-2 rounded-lg font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2 rounded-lg font-bold bg-slate-900 text-amber-400 hover:bg-slate-800 shadow-md cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CREATE SERVICE DESK MODAL --- */}
      {createDeskModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Create New Physical Service Desk</h3>
            <form onSubmit={handleCreateDeskSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">2-Letter Code</label>
                  <input type="text" maxLength={2} required value={newDeskForm.code} onChange={(e) => setNewDeskForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} className="w-full border rounded p-2 font-extrabold uppercase text-amber-600" placeholder="e.g. SH" />
                </div>
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Service Desk Name</label>
                  <input type="text" required value={newDeskForm.name} onChange={(e) => setNewDeskForm(prev => ({ ...prev, name: e.target.value }))} className="w-full border rounded p-2" placeholder="e.g. St Heliers Bay Library" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Physical Address</label>
                  <input type="text" required value={newDeskForm.address} onChange={(e) => setNewDeskForm(prev => ({ ...prev, address: e.target.value }))} className="w-full border rounded p-2" placeholder="Street address..." />
                </div>
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Region (Master Dropdown)</label>
                  <select value={newDeskForm.region} onChange={(e) => setNewDeskForm(prev => ({ ...prev, region: e.target.value }))} className="w-full border rounded p-2 font-bold text-slate-900">
                    {regions.map(r => (
                      <option key={r.id} value={r.name}>{r.name} [{r.code}]</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-amber-50/60 p-3 rounded-lg border border-amber-200">
                <div>
                  <label className="block font-extrabold text-slate-800 mb-1">Primary Desk Admin</label>
                  <select 
                    value={newDeskForm.primaryAdminId} 
                    onChange={(e) => setNewDeskForm(prev => ({ ...prev, primaryAdminId: e.target.value }))} 
                    className="w-full border border-slate-300 rounded p-2 font-bold text-slate-900 bg-white"
                  >
                    <option value="">-- Vacant --</option>
                    {eligibleAdminsList.map(u => (
                      <option key={u.id} value={u.id}>{u.role ? `${u.fullName} (${u.role})` : u.fullName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-extrabold text-slate-800 mb-1">Secondary Desk Admin</label>
                  <select 
                    value={newDeskForm.secondaryAdminId} 
                    onChange={(e) => setNewDeskForm(prev => ({ ...prev, secondaryAdminId: e.target.value }))} 
                    className="w-full border border-slate-300 rounded p-2 font-bold text-slate-900 bg-white"
                  >
                    <option value="">-- Vacant --</option>
                    {eligibleAdminsList
                      .filter(u => u.id !== newDeskForm.primaryAdminId)
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.role ? `${u.fullName} (${u.role})` : u.fullName}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-sky-50/60 p-3 rounded-lg border border-sky-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Site Contact Name</label>
                  <input type="text" value={newDeskForm.siteContactName} onChange={(e) => setNewDeskForm(prev => ({ ...prev, siteContactName: e.target.value }))} className="w-full border rounded p-2 bg-white" placeholder="e.g. Facility Manager" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Site Contact Email</label>
                  <input type="email" value={newDeskForm.siteContactEmail} onChange={(e) => setNewDeskForm(prev => ({ ...prev, siteContactEmail: e.target.value }))} className="w-full border rounded p-2 bg-white" placeholder="manager@site.co.nz" />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Desk Notes & Instructions</label>
                <textarea rows={2} value={newDeskForm.notes} onChange={(e) => setNewDeskForm(prev => ({ ...prev, notes: e.target.value }))} className="w-full border rounded p-2 text-xs" placeholder="Operational notes..." />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setCreateDeskModalOpen(false)} className="px-4 py-2 rounded font-bold bg-slate-100 text-slate-700">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded font-bold bg-slate-900 text-amber-400">Create Desk</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DestructiveConfirmationDialog
        confirmLabel="Delete Shift Slot"
        isOpen={Boolean(pendingDeleteSlotId)}
        message="Are you sure you want to delete this shift slot template? This will remove its recurring shift occurrences from the 12-week calendar view."
        onCancel={() => setPendingDeleteSlotId(null)}
        onConfirm={confirmDeleteSlot}
        title="Confirm Shift Slot Deletion"
      />

      <DestructiveConfirmationDialog
        cancelLabel="No / Keep Record"
        confirmLabel="Yes / Permanently Delete"
        isOpen={Boolean(confirmDeleteStatId)}
        message="Are you sure you want to permanently delete this statistics record? This action cannot be undone and will update the master association logs immediately."
        onCancel={() => setConfirmDeleteStatId(null)}
        onConfirm={confirmDeleteStatRecord}
        title="Confirm Statistics Log Deletion"
      />

      {customDateModalOpen && (
        <CustomDateRangeModal
          applyLabel="Apply Date Range"
          fromDate={customFromDate}
          onClose={() => setCustomDateModalOpen(false)}
          onApply={({ fromDate, toDate }) => {
            setCustomFromDate(fromDate);
            setCustomToDate(toDate);
            setCustomDateModalOpen(false);
          }}
          title="Select Custom Date Range"
          toDate={customToDate}
        />
      )}

      {/* --- LOG STATS MODAL WINDOW FOR JP DUTY SHIFTS --- */}
      {logStatsOccurrence && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-slate-200 my-auto max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">{logStatsOccurrence.isHomeBasedService ? 'Special Service Log' : 'Shift Completion Log'}</span>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">{logStatsOccurrence.isHomeBasedService ? 'Log Home Based Service Statistics' : 'Log Shift Service Statistics'}</h3>
              </div>
              <button onClick={() => setLogStatsOccurrence(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStatsSubmit} {...statisticsInputSelection} className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 font-semibold text-slate-700">
                <div className="text-slate-900 font-extrabold text-xs sm:text-sm">
                  {logStatsOccurrence.isHomeBasedService ? 'Home Based Service' : `${activeDeskMap[logStatsOccurrence.deskId]?.name} [${activeDeskMap[logStatsOccurrence.deskId]?.code}]`}
                </div>
                {logStatsOccurrence.isHomeBasedService ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Date</label>
                      <input type="date" required value={logStatsOccurrence.date} onChange={(event) => setLogStatsOccurrence(previous => ({ ...previous, date: event.target.value }))} className="w-full border border-slate-300 rounded-lg p-2 bg-white text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">Start time</label>
                      <input type="time" required value={logStatsOccurrence.startTime} onChange={(event) => setLogStatsOccurrence(previous => ({ ...previous, startTime: event.target.value }))} className="w-full border border-slate-300 rounded-lg p-2 bg-white text-sm" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap justify-between text-[11px] text-slate-600">
                    <span>📅 {logStatsOccurrence.formattedDate}</span>
                    <span>⏰ {logStatsOccurrence.startTime} - {logStatsOccurrence.endTime}</span>
                  </div>
                )}
                {statisticsSubjectUser && <div className="text-[11px] text-slate-700">JP Member: <b>{statisticsSubjectUser.fullName}</b> {statisticsSubjectUser.warrantNumber ? `(${statisticsSubjectUser.warrantNumber})` : ''}</div>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="block font-bold text-slate-700 mb-1">No. of JP Duties</label>
                  <input 
                    type="number" 
                    min="0"
                    step="1"
                    readOnly
                    value={statsForm.noOfJpDuties} 
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-500 text-sm bg-slate-200 cursor-not-allowed"
                    title="Calculated automatically: one JP duty for each two hours or part thereof"
                  />
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="block font-bold text-slate-700 mb-1">No. of Clients</label>
                  <input 
                    type="number" 
                    min="0"
                    step="1"
                    required 
                    value={statsForm.noOfClients} 
                    onChange={(e) => handleStatsInputChange('noOfClients', e.target.value)} 
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-sm bg-white" 
                  />
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="block font-bold text-slate-700 mb-1">Hours Worked (0.00)</label>
                  <input 
                    type="number" 
                    min="0"
                    step="0.25"
                    required 
                    value={statsForm.noOfHoursWorked} 
                    onChange={(e) => handleStatsInputChange('noOfHoursWorked', e.target.value, true)} 
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-sm bg-white" 
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">Document Breakdown</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Certified Copies</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      value={statsForm.certifiedCopies} 
                      onChange={(e) => handleStatsInputChange('certifiedCopies', e.target.value)} 
                      className="w-full border rounded p-2 font-bold bg-white" 
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Statutory Declarations</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      value={statsForm.statutoryDeclarations} 
                      onChange={(e) => handleStatsInputChange('statutoryDeclarations', e.target.value)} 
                      className="w-full border rounded p-2 font-bold bg-white" 
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Signatures Witnessed</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      value={statsForm.signatureWitnessed} 
                      onChange={(e) => handleStatsInputChange('signatureWitnessed', e.target.value)} 
                      className="w-full border rounded p-2 font-bold bg-white" 
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Affidavits</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      value={statsForm.affidavits} 
                      onChange={(e) => handleStatsInputChange('affidavits', e.target.value)} 
                      className="w-full border rounded p-2 font-bold bg-white" 
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">Other Duties</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      value={statsForm.other} 
                      onChange={(e) => handleStatsInputChange('other', e.target.value)} 
                      className="w-full border rounded p-2 font-bold bg-white" 
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Shift Notes</label>
                <textarea 
                  rows={3}
                  value={statsForm.notes} 
                  onChange={(e) => setStatsForm(prev => ({ ...prev, notes: e.target.value }))} 
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs" 
                  placeholder="Optional shift notes or observations..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setLogStatsOccurrence(null)} 
                  className="px-4 py-2 rounded-lg font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 rounded-lg font-bold bg-slate-900 text-amber-400 hover:bg-slate-800 shadow-md cursor-pointer"
                >
                  Save Statistics Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DETAILED SHIFT OCCURRENCE MODAL --- */}
      {detailedSlotModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="bg-slate-900 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded uppercase mr-2">
                  {activeDeskMap[detailedSlotModal.deskId]?.code || 'JP'}
                </span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shift Details</span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">{activeDeskMap[detailedSlotModal.deskId]?.name}</h3>
              </div>
              <button onClick={() => setDetailedSlotModal(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-600">Date & Day:</span>
                  <span className="font-extrabold text-slate-900">{detailedSlotModal.fullDayName}, {detailedSlotModal.formattedDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-slate-600">Shift Hours:</span>
                  <span className="font-extrabold text-slate-900">{detailedSlotModal.startTime} - {detailedSlotModal.endTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-slate-600">Region:</span>
                  <span className="font-extrabold text-slate-900">{activeDeskMap[detailedSlotModal.deskId]?.region}</span>
                </div>
                {detailedSlotModal.isHoliday && (
                  <div className="flex justify-between text-slate-600">
                  <span className="font-bold">Closure:</span>
                  <span className="font-extrabold">{detailedSlotModal.holidayDescription ? `Statutory holiday — ${detailedSlotModal.holidayDescription}` : 'Desk closed'}</span>
                  </div>
                )}
              </div>

              {canManageHolidayForDesk(detailedSlotModal.deskId) && (
                <label className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer ${detailedSlotModal.isHoliday ? 'bg-slate-200 border-slate-400' : 'bg-amber-50 border-amber-200'}`}>
                  <div>
                    <span className="font-extrabold text-slate-900 text-xs block">Holiday / Desk closed</span>
                    <span className="text-[11px] text-slate-600">Tick to close this individual desk slot on {detailedSlotModal.formattedDate}. Untick to operate on a statutory holiday.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={detailedSlotModal.isHoliday}
                    onChange={(event) => handleSetOccurrenceHoliday(detailedSlotModal, event.target.checked)}
                    className="w-4 h-4 rounded text-slate-700 cursor-pointer"
                  />
                </label>
              )}

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-slate-900 uppercase tracking-wider text-[10px]">
                    Assigned Duty JPs ({detailedSlotModal.assignedJpIds.length}/{detailedSlotModal.targetJps})
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Max Capacity: {detailedSlotModal.maxJps}</span>
                </div>

                {detailedSlotModal.assignedJpIds.length === 0 ? (
                  <div className="text-slate-400 italic text-[11px] py-1">No JPs registered for this shift yet.</div>
                ) : (
                  <ul className="space-y-1">
                    {detailedSlotModal.assignedJpIds.map(id => {
                      const jp = userMap[id];
                      return (
                        <li key={id} className="p-2 bg-white rounded border border-slate-200 flex justify-between items-center font-bold text-slate-900">
                          <span>{jp ? jp.fullName : id}</span>
                          <span className="text-slate-500 font-mono text-[10px]">{jp?.warrantNumber}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <span className="font-extrabold text-slate-900 uppercase tracking-wider text-[10px] block">Desk Notes</span>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  {activeDeskMap[detailedSlotModal.deskId]?.notes || 'No specific operational notes.'}
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button 
                onClick={() => setDetailedSlotModal(null)} 
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD / EDIT USER MODAL --- */}
      {userModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">{editingUserId ? 'Edit JP Member Profile' : 'Add New JP Member'}</h3>
            <form onSubmit={handleSaveUserSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Legal Name</label>
                <input type="text" required value={userForm.fullName} onChange={(e) => setUserForm(prev => ({ ...prev, fullName: e.target.value }))} className="w-full border rounded p-2" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Warrant Number</label>
                  <div className="flex rounded border overflow-hidden bg-white focus-within:ring-2 focus-within:ring-amber-300">
                    <span className="px-2 py-2 bg-slate-100 border-r font-mono font-bold text-slate-700">JP-</span>
                    <input type="text" required inputMode="numeric" pattern="[0-9]*" value={userForm.warrantNumber} onChange={(e) => setUserForm(prev => ({ ...prev, warrantNumber: warrantNumberDigits(e.target.value) }))} className="min-w-0 flex-1 p-2 font-mono outline-none" placeholder="12345" />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Role</label>
                  <select value={userForm.role} onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))} className="w-full border rounded p-2 font-bold">
                    <option value="Member">Member</option>
                    <option value="Admin">Desk Admin</option>
                    <option value="Registrar">Registrar</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                  <input type="email" required value={userForm.email} onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mobile Phone</label>
                  <input type="tel" value={userForm.phone} onChange={(e) => setUserForm(prev => ({ ...prev, phone: e.target.value }))} className="w-full border rounded p-2" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Password</label>
                  <input type="text" required value={userForm.password} onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))} className="w-full border rounded p-2 font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Account Status</label>
                  <div className="w-full border rounded p-2 font-bold bg-slate-50 text-slate-600">{userForm.status}</div>
                  <p className="text-[10px] text-slate-500 mt-1">Status changes use the explicit Approve, Reject, Reconsider, Archive and Restore actions.</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <input type="checkbox" id="userIsProv" checked={userForm.isProvisional} onChange={(e) => setUserForm(prev => ({ ...prev, isProvisional: e.target.checked }))} className="rounded text-amber-500 cursor-pointer" />
                <label htmlFor="userIsProv" className="font-bold text-slate-800 cursor-pointer">Provisional JP</label>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setUserModalOpen(false)} className="px-4 py-2 rounded font-bold bg-slate-100 text-slate-700">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded font-bold bg-slate-900 text-amber-400">Save Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {archivePreview && pendingArchiveUserId && <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title">
        <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
          <h3 id="archive-dialog-title" className="text-lg font-black text-rose-700">Confirm Member Archival</h3>
          <p className="text-sm text-slate-700">Archive <b>{archivePreview.member.fullName}</b>?</p>
          <ul className="text-xs text-slate-600 list-disc pl-5 space-y-1"><li>Future bookings cancelled: <b>{archivePreview.future_booking_count || 0}</b></li><li>Recurring rules stopped: <b>{archivePreview.recurring_rule_count || 0}</b></li><li>Desk-admin assignments cleared: <b>{archivePreview.desk_admin_assignment_count || 0}</b></li></ul>
          <p className="text-xs text-slate-600">Historical duties, statistics and cancellation evidence are retained. Operational access ceases immediately; the authentication account is not deleted.</p>
          {lifecycleError && <p role="alert" className="text-xs text-rose-700">{lifecycleError}</p>}
          <div className="flex justify-end gap-2 border-t pt-3"><button disabled={archiveSubmitting} onClick={() => { setPendingArchiveUserId(null); setArchivePreview(null); }} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100">Cancel</button><button disabled={archiveSubmitting} onClick={confirmArchiveUser} className="px-4 py-2 rounded-lg text-xs font-black bg-rose-600 text-white">{archiveSubmitting ? 'Archiving…' : 'Archive Member'}</button></div>
        </div>
      </div>}

      {pendingReinstateUser && <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="reinstate-dialog-title">
        <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
          <h3 id="reinstate-dialog-title" className="text-lg font-black text-emerald-700">Reinstate Member</h3>
          <p className="text-sm text-slate-700">Choose the new role for <b>{pendingReinstateUser.fullName}</b>. This restores Approved access but does not restore cancelled bookings, recurring rules, or former desk-admin assignments.</p>
          <label className="block text-xs font-bold text-slate-700">New role<select value={reinstateRole} onChange={event => setReinstateRole(event.target.value)} disabled={reinstateSubmitting} className="block w-full border rounded p-2 mt-1"><option value="">Select a role…</option><option value="Member">Member</option><option value="Admin">Admin</option><option value="Registrar">Registrar</option></select></label>
          {lifecycleError && <p role="alert" className="text-xs text-rose-700">{lifecycleError}</p>}
          <div className="flex justify-end gap-2 border-t pt-3"><button disabled={reinstateSubmitting} onClick={() => setPendingReinstateUser(null)} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100">Cancel</button><button disabled={reinstateSubmitting || !reinstateRole} onClick={confirmRestoreArchivedUser} className="px-4 py-2 rounded-lg text-xs font-black bg-emerald-600 text-white">{reinstateSubmitting ? 'Reinstating…' : 'Reinstate Member'}</button></div>
        </div>
      </div>}

      {/* --- ADD / EDIT REGION MODAL --- */}
      {regionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">{editingRegionId ? 'Edit Master Region' : 'Add New Master Region'}</h3>
            <form onSubmit={handleSaveRegionSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Region Name</label>
                <input type="text" required value={regionForm.name} onChange={(e) => setRegionForm(prev => ({ ...prev, name: e.target.value }))} className="w-full border rounded p-2" placeholder="e.g. Auckland East" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Short Code</label>
                <input type="text" required value={regionForm.code} onChange={(e) => setRegionForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} className="w-full border rounded p-2 font-mono uppercase" placeholder="e.g. AKL-E" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Timezone</label>
                <select required value={regionForm.timezone} onChange={(e) => setRegionForm(prev => ({ ...prev, timezone: e.target.value }))} className="w-full border rounded p-2 font-mono bg-white">
                  <option value={DEFAULT_ROSTER_TIME_ZONE}>Pacific/Auckland — New Zealand (default)</option>
                  {regionTimeZoneOptions
                    .filter(timeZone => timeZone !== DEFAULT_ROSTER_TIME_ZONE)
                    .map(timeZone => <option key={timeZone} value={timeZone}>{timeZone}</option>)}
                </select>
                <p className="mt-1 text-[10px] text-slate-500">Standard IANA timezone names. Type the first letters while the list is open to jump to a timezone.</p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setRegionModalOpen(false)} className="px-4 py-2 rounded font-bold bg-slate-100 text-slate-700">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded font-bold bg-slate-900 text-amber-400">Save Region</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DestructiveConfirmationDialog
        confirmLabel="Delete Region"
        isOpen={Boolean(pendingDeleteRegionId)}
        message="Are you sure you want to delete this master region?"
        onCancel={() => setPendingDeleteRegionId(null)}
        onConfirm={confirmDeleteRegion}
        title="Confirm Region Deletion"
      />

      <DestructiveConfirmationDialog
        confirmLabel="Archive Desk"
        isOpen={Boolean(pendingDeleteDeskId)}
        message="Are you sure you want to archive this service desk location? It will be moved to the Archived Desks list and its shifts will be hidden from active calendar views."
        onCancel={() => setPendingDeleteDeskId(null)}
        onConfirm={confirmDeleteDesk}
        title="Confirm Service Desk Archival"
      />

      {/* --- SIGN UP MODAL --- */}
      {signUpModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">JP Roster Sign-Up Request</h3>
                <p className="text-xs text-slate-500 mt-0.5">Register for access to the Auckland JP Service Desk Platform</p>
              </div>
              <button onClick={() => {
                setSignUpForm(EMPTY_SIGN_UP_FORM);
                setSignUpSuccessMsg(false);
                setShowSignUpPassword(false);
                setShowSignUpConfirmPassword(false);
                setSignUpPasswordError('');
                setSignUpModalOpen(false);
              }} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {signUpSuccessMsg ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-xl text-xs font-bold space-y-2 text-center animate-fade-in">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-sm font-black text-emerald-950">Application Submitted!</p>
                <p>Email confirmation and AJPA membership approval are separate steps. After email confirmation you may sign in, but operational access remains unavailable until AJPA approval.</p>
                <p className="font-normal text-slate-600 leading-relaxed">
                  {signUpSuccessMsg.confirmationExpected
                    ? 'A confirmation email has been sent. Click the link within one hour, and check spam or junk if it does not arrive.'
                    : 'Your application has been submitted. If Supabase requires email confirmation, check your inbox and spam or junk folder, and use the confirmation link within one hour.'}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSignUpSubmit} autoComplete="off" className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Legal Name</label>
                  <input 
                    type="text"
                    name="fullName"
                    autoComplete="off"
                    required 
                    value={signUpForm.fullName}
                    onChange={(e) => setSignUpForm(prev => ({ ...prev, fullName: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-medium"
                    placeholder="e.g. John Smith"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Warrant Number</label>
                    <div className="flex rounded-lg border border-slate-300 overflow-hidden bg-white focus-within:ring-2 focus-within:ring-amber-300">
                      <span className="px-3 py-2.5 bg-slate-100 border-r border-slate-300 font-mono font-bold text-slate-700">JP-</span>
                      <input
                        type="text"
                        name="warrantNumber"
                        autoComplete="off"
                        required
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={signUpForm.warrantNumber}
                        onChange={(e) => setSignUpForm(prev => ({ ...prev, warrantNumber: warrantNumberDigits(e.target.value) }))}
                        className="min-w-0 flex-1 p-2.5 text-sm font-mono outline-none"
                        placeholder="12345"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Enter the number only.</p>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Mobile Phone</label>
                    <input 
                      type="tel"
                      name="phone"
                      autoComplete="off"
                      required 
                      value={signUpForm.phone}
                      onChange={(e) => setSignUpForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                      placeholder="021 000 0000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                  <input 
                    type="email"
                    name="email"
                    autoComplete="off"
                    required 
                    value={signUpForm.email}
                    onChange={(e) => setSignUpForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                    placeholder="john@example.co.nz"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Account Password</label>
                  <div className="relative">
                    <input
                      type={showSignUpPassword ? 'text' : 'password'}
                      name="new-password"
                      autoComplete="new-password"
                      required
                      value={signUpForm.password}
                      onChange={(e) => { setSignUpForm(prev => ({ ...prev, password: e.target.value })); setSignUpPasswordError(''); }}
                      className="w-full border border-slate-300 rounded-lg pr-10 p-2.5 text-sm"
                      placeholder="Create a password"
                    />
                    <button type="button" onClick={() => setShowSignUpPassword(!showSignUpPassword)} className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 transition cursor-pointer" title={showSignUpPassword ? 'Hide Password' : 'Show Password'}>
                      {showSignUpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Confirm Password</label>
                  {signUpPasswordError && <p className="mb-1.5 text-rose-700 font-bold">{signUpPasswordError}</p>}
                  <div className="relative">
                    <input
                      type={showSignUpConfirmPassword ? 'text' : 'password'}
                      name="confirm-password"
                      autoComplete="new-password"
                      required
                      value={signUpForm.confirmPassword}
                      onChange={(e) => { setSignUpForm(prev => ({ ...prev, confirmPassword: e.target.value })); setSignUpPasswordError(''); }}
                      className={`w-full border rounded-lg pr-10 p-2.5 text-sm ${signUpPasswordError ? 'border-rose-400 bg-rose-50' : 'border-slate-300'}`}
                      placeholder="Enter password again"
                    />
                    <button type="button" onClick={() => setShowSignUpConfirmPassword(!showSignUpConfirmPassword)} className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 transition cursor-pointer" title={showSignUpConfirmPassword ? 'Hide Password' : 'Show Password'}>
                      {showSignUpConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input 
                    type="checkbox" 
                    id="signUpProv" 
                    checked={signUpForm.isProvisional}
                    onChange={(e) => setSignUpForm(prev => ({ ...prev, isProvisional: e.target.checked }))}
                    className="rounded text-amber-500 cursor-pointer w-4 h-4"
                  />
                  <label htmlFor="signUpProv" className="font-bold text-slate-800 cursor-pointer text-xs">
                    I am a Provisional Justice of the Peace
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-end space-x-2">
                  <button 
                    type="button" 
                    onClick={() => {
                      setSignUpForm(EMPTY_SIGN_UP_FORM);
                      setSignUpSuccessMsg(false);
                      setShowSignUpPassword(false);
                      setShowSignUpConfirmPassword(false);
                      setSignUpPasswordError('');
                      setSignUpModalOpen(false);
                    }}
                    className="px-4 py-2.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2.5 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow cursor-pointer uppercase tracking-wider"
                  >
                    Submit Sign-Up
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* --- FORGOT PASSWORD MODAL --- */}
      {forgotModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">Reset Your Password</h3>
                <p className="text-xs text-slate-500 mt-0.5">Enter your email to receive a password reset link</p>
              </div>
              <button onClick={() => setForgotModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetLinkSent ? (
              <div className="bg-sky-50 border border-sky-200 text-sky-900 p-4 rounded-xl text-xs font-bold space-y-3 text-center animate-fade-in">
                <Mail className="w-8 h-8 text-sky-600 mx-auto" />
                <p className="text-sm font-black text-sky-950">Password Reset Requested</p>
                <p className="font-normal text-slate-600 leading-relaxed">
                  If an approved account exists for this address, a password-reset link will be sent. Check your inbox and spam folder, then open the link to choose a new password.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendResetLink} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Registered Email Address</label>
                  <input 
                    type="email" 
                    required 
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                    placeholder="e.g. rob@broadbridge.co.nz"
                  />
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-end space-x-2">
                  <button 
                    type="button" 
                    onClick={() => setForgotModalOpen(false)} 
                    className="px-4 py-2.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2.5 rounded-lg text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-amber-400 shadow cursor-pointer"
                  >
                    Send Reset Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      <Analytics />
    </div>
  );
}
