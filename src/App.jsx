import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { getCurrentApprovedUser, requestPasswordReset, signInApprovedUser, signOutUser, updatePassword } from './services/authService';
import { fetchRosterActivityAudit, fetchRosterData } from './services/rosterService';
import { saveUserPreferences } from './services/preferencesService';
import { DEFAULT_DAY_FILTER, DEFAULT_TIME_OF_DAY_FILTER } from './config/calendar';
import { getNextMondayMidnight, getWeekStartMonday } from './utils/calendarDates';
import { 
  Calendar, MapPin, Users, UserCheck, ShieldAlert, 
  Plus, Search, Filter, Download, ChevronLeft, ChevronRight, ChevronDown,
  CheckCircle2, AlertTriangle, FileText, UserPlus, 
  LogOut, Phone, Mail, Award, Check, X, Lock, Key, ArrowLeft, Send,
  Edit2, Trash2, RotateCcw, Archive, Ban, CalendarPlus, Info, HelpCircle, Star,
  Globe, Shield, UserX, Building2, CheckSquare, Square, BarChart2, Clock, Database,
  Eye, EyeOff
} from 'lucide-react';

// --- MASTER REGIONS LIST ---
const INITIAL_REGIONS = [
  { id: 'reg-1', name: 'Auckland East', code: 'AKL-E' }
];

// --- INITIAL USERS ---
const INITIAL_USERS = [
  { id: 'usr-1', fullName: 'Rob Broadbridge (R)', email: 'rob@broadbridge.co.nz', phone: '274909378', warrantNumber: 'JP-99999', role: 'Registrar', isProvisional: false, status: 'Approved' },
  { id: 'usr-2', fullName: 'Rob Broadbridge (A)', email: 'rob.broadbridge@gmail.com', phone: '', warrantNumber: 'JP-88888', role: 'Admin', isProvisional: false, status: 'Approved' },
  { id: 'usr-3', fullName: 'Rob Broadbbridge (JP)', email: 'jp@broadbridge.co.nz', phone: '', warrantNumber: 'JP-25138', role: 'Member', isProvisional: false, status: 'Approved' }
];

// --- INITIAL SERVICE DESKS WITH EXPANDED ADMIN & SITE CONTACT FIELDS ---
const INITIAL_SERVICE_DESKS = [
  {
    id: 'desk-remuera',
    code: 'RM',
    name: 'Remuera Library',
    address: '429 Remuera Road, Remuera, Auckland 1050',
    region: 'Auckland East',
    primaryAdminId: 'usr-1',
    secondaryAdminId: 'usr-2',
    siteContactName: '',
    siteContactEmail: '',
    contactPerson: '',
    notes: 'The desk is set up in the library to the right of the front entrance. See library staff for signs. They have a pull up sign behind the desk.',
    status: 'Active'
  },
  {
    id: 'desk-glen-innes',
    code: 'GI',
    name: 'Glen Innes Library',
    address: '108 Line Road, Glen Innes, Auckland 1072',
    region: 'Auckland East',
    primaryAdminId: 'usr-1',
    secondaryAdminId: 'usr-2',
    siteContactName: '',
    siteContactEmail: '',
    contactPerson: '',
    notes: 'Desk is set up to the right as you enter the library. Put sign in the foyer outside on the path at the start and bring it back in at the end of the shift.',
    status: 'Active'
  },
  {
    id: 'desk-st-heliers',
    code: 'SH',
    name: 'St Heliers Library',
    address: '32 Saint Heliers Bay Road, St Heliers, Auckland 1071',
    region: 'Auckland East',
    primaryAdminId: 'usr-1',
    secondaryAdminId: 'usr-2',
    siteContactName: '',
    siteContactEmail: '',
    contactPerson: '',
    notes: 'Set up is in the room to the right as you come in the front door.',
    status: 'Active'
  },
  {
    id: 'desk-panmure',
    code: 'PN',
    name: 'Panmure Library',
    address: '7/13 Pilkington Road, Panmure, Auckland 1072',
    region: 'Auckland East',
    primaryAdminId: 'usr-1',
    secondaryAdminId: 'usr-2',
    siteContactName: '',
    siteContactEmail: '',
    contactPerson: '',
    notes: 'Tables are set up in the centre of the library with chairs for people waiting.',
    status: 'Active'
  },
  {
    id: 'desk-parnell',
    code: 'PL',
    name: 'Parnell Community Centre',
    address: 'Jubilee Building 545 Parnell Road, Parnell, Auckland 1052',
    region: 'Auckland East',
    primaryAdminId: 'usr-1',
    secondaryAdminId: 'usr-2',
    siteContactName: '',
    siteContactEmail: '',
    contactPerson: '',
    notes: '',
    status: 'Active'
  },
  {
    id: 'desk-newmarket',
    code: 'NM',
    name: 'Newmarket Westfield',
    address: '277 Broadway, Newmarket, Auckland 1023',
    region: 'Auckland East',
    primaryAdminId: 'usr-1',
    secondaryAdminId: 'usr-2',
    siteContactName: '',
    siteContactEmail: '',
    contactPerson: '',
    notes: 'The desk is at the entrance to Westfield at the corner of Morrow Street and Broadway. See the staff at the information desk to register your car for free parking. Desk is down the walkway to the lifts near the information counter. A sign can be pulled out into the mall and returned at the end of the shift.',
    status: 'Active'
  },
  {
    id: 'desk-otahuhu',
    code: 'OH',
    name: 'Otahuhu Library',
    address: '28/30 Mason Avenue, Ōtāhuhu, Auckland 1062',
    region: 'Auckland East',
    primaryAdminId: 'usr-1',
    secondaryAdminId: 'usr-2',
    siteContactName: '',
    siteContactEmail: '',
    contactPerson: '',
    notes: 'The desk is in a room to the left as you come up the stairs from the entrance in the mall.',
    status: 'Active'
  }
];

const INITIAL_SLOT_TEMPLATES = [
  { id: 'slot-gi-1', deskId: 'desk-glen-innes', dayOfWeek: 'Monday', startTime: '09:30', endTime: '11:30', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-gi-2', deskId: 'desk-glen-innes', dayOfWeek: 'Tuesday', startTime: '09:30', endTime: '11:30', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-gi-3', deskId: 'desk-glen-innes', dayOfWeek: 'Wednesday', startTime: '09:30', endTime: '11:30', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-gi-4', deskId: 'desk-glen-innes', dayOfWeek: 'Thursday', startTime: '09:30', endTime: '11:30', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-gi-5', deskId: 'desk-glen-innes', dayOfWeek: 'Friday', startTime: '09:30', endTime: '11:30', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-sh-1', deskId: 'desk-st-heliers', dayOfWeek: 'Thursday', startTime: '13:00', endTime: '15:00', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-sh-2', deskId: 'desk-st-heliers', dayOfWeek: 'Saturday', startTime: '13:00', endTime: '15:00', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-pn-1', deskId: 'desk-panmure', dayOfWeek: 'Monday', startTime: '13:30', endTime: '15:30', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-pn-2', deskId: 'desk-panmure', dayOfWeek: 'Wednesday', startTime: '17:00', endTime: '18:30', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-pn-3', deskId: 'desk-panmure', dayOfWeek: 'Saturday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-pn-4', deskId: 'desk-panmure', dayOfWeek: 'Sunday', startTime: '12:00', endTime: '14:00', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-oh-1', deskId: 'desk-otahuhu', dayOfWeek: 'Saturday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-rm-1', deskId: 'desk-remuera', dayOfWeek: 'Tuesday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-rm-2', deskId: 'desk-remuera', dayOfWeek: 'Friday', startTime: '12:00', endTime: '14:00', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-nm-1', deskId: 'desk-newmarket', dayOfWeek: 'Wednesday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' },
  { id: 'slot-nm-2', deskId: 'desk-newmarket', dayOfWeek: 'Saturday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 1, maxJps: 2, status: 'Active', effectiveFromDate: '2026-09-01' }
];

const INITIAL_ASSIGNMENTS = {
  'desk-glen-innes_slot-gi-4_2026-09-03': ['usr-3'],
  'desk-remuera_slot-rm-2_2026-09-04': ['usr-3'],
  'desk-newmarket_slot-nm-2_2026-09-05': ['usr-3'],
  'desk-glen-innes_slot-gi-4_2026-09-10': ['usr-3'],
  'desk-remuera_slot-rm-2_2026-09-11': ['usr-3'],
  'desk-newmarket_slot-nm-2_2026-09-12': ['usr-3']
};

const INITIAL_LOGGED_STATISTICS = [
  {
    id: 'stat-1',
    jpId: 'usr-3',
    jpName: 'Rob Broadbbridge (JP)',
    warrantNumber: 'JP-25138',
    deskId: 'desk-glen-innes',
    deskName: 'Glen Innes Library',
    deskCode: 'GI',
    region: 'Auckland East',
    // These two fields make the statistics record unambiguous when a desk has
    // more than one duty on the same day.
    slotId: 'slot-gi-4',
    occurrenceKey: 'desk-glen-innes_slot-gi-4_2026-09-03',
    date: '2026-09-03',
    startTime: '09:30',
    endTime: '11:30',
    noOfJpDuties: 1,
    noOfClients: 21,
    noOfHoursWorked: 2.0,
    certifiedCopies: 66,
    statutoryDeclarations: 9,
    signatureWitnessed: 1,
    affidavits: 0,
    other: 0,
    notes: 'Morning shift at GI library'
  }
];

// A JP duty is counted for each complete or partial two-hour block.
// Examples: 0 hours = 0 duties, 0.25–2 hours = 1 duty, 2.25–4 hours = 2 duties.
const calculateJpDuties = (hoursWorked) => {
  const hours = Number(hoursWorked);
  return Number.isFinite(hours) && hours > 0 ? Math.ceil(hours / 2) : 0;
};

// iCalendar readers in Apple Calendar are stricter than some other clients.
// Use CRLF endings, a stable UID, an explicit Auckland timezone and folded
// content lines so the downloaded appointment is portable across Apple,
// Google and Microsoft calendar applications.
const escapeIcsText = (value = '') => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const foldIcsLine = (line) => {
  const encoder = new TextEncoder();
  const foldedLines = [];
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

const buildCalendarFile = ({ profileId, slotId, date, startTime, endTime, deskName, deskAddress }) => {
  const location = `${deskName}, ${deskAddress}`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  const dateTime = (time) => `${date.replaceAll('-', '')}T${time.replaceAll(':', '').slice(0, 4)}00`;
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
    `UID:ajpa-duty-${profileId}-${slotId}-${date}@contact.broadbridge.co.nz`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Pacific/Auckland:${dateTime(startTime)}`,
    `DTEND;TZID=Pacific/Auckland:${dateTime(endTime)}`,
    `SUMMARY:${escapeIcsText(`JP duty - ${deskName}`)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(`Confirmed JP duty at ${deskName}.\nAddress: ${deskAddress}\nMap: ${mapLink}`)}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
};

// Duty times are Auckland times, irrespective of the device's own timezone.
// A sortable local timestamp lets the action controls close at the correct
// moment without relying on browser-specific date parsing.
const getAucklandTimestamp = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((values, part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
    return values;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
};

const hasShiftEnded = (occurrence, now = new Date()) => {
  if (!occurrence?.date || !occurrence?.endTime) return false;
  return getAucklandTimestamp(now) > `${occurrence.date}T${occurrence.endTime}:00`;
};

export default function App() {
  // --- AUTH & GLOBAL STATE ---
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authRestoring, setAuthRestoring] = useState(true);
  const [activeTab, setActiveTab] = useState('calendar');
  const [profileForm, setProfileForm] = useState({ email: '', phone: '', reminderFrequency: 'NONE', reminderStartDate: '', reminderWeeks: 4 });
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
  const [followedDesks, setFollowedDesks] = useState(['desk-remuera', 'desk-glen-innes', 'desk-st-heliers', 'desk-panmure', 'desk-parnell', 'desk-newmarket', 'desk-otahuhu']);

  const [slotAssignments, setSlotAssignments] = useState(INITIAL_ASSIGNMENTS);
  const [recurringRules, setRecurringRules] = useState([]); // Persistent bulk registration/withdrawal rules for auto-rollover
  const [cancelledSlotInstances, setCancelledSlotInstances] = useState([]);
  const [loggedStatistics, setLoggedStatistics] = useState(INITIAL_LOGGED_STATISTICS);
  const [statutoryHolidays, setStatutoryHolidays] = useState([]);
  const [slotHolidayOverrides, setSlotHolidayOverrides] = useState([]);
  const [rosterActivityAudit, setRosterActivityAudit] = useState([]);
  const [rosterActivityAuditError, setRosterActivityAuditError] = useState('');

  // REGISTRATION & WITHDRAWAL MODAL STATES
  const [registerModalOcc, setRegisterModalOcc] = useState(null);
  const [registerOption, setRegisterOption] = useState('SINGLE'); // 'SINGLE', 'NEXT_N', 'UNTIL_DATE', 'ALL_FUTURE'
  const [registerCountN, setRegisterCountN] = useState(4);
  const [registerUntilDate, setRegisterUntilDate] = useState('2026-12-31');

  const [withdrawModalOcc, setWithdrawModalOcc] = useState(null);
  const [withdrawOption, setWithdrawOption] = useState('SINGLE'); // 'SINGLE', 'NEXT_N', 'UNTIL_DATE', 'ALL_FUTURE'
  const [withdrawCountN, setWithdrawCountN] = useState(4);
  const [withdrawUntilDate, setWithdrawUntilDate] = useState('2026-12-31');

  // AUTH SCREEN MODALS & FORMS
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // PENDING MEMBERS REGISTRAR POPUP
  const [pendingMembersNoticeCount, setPendingMembersNoticeCount] = useState(0);

  // Sign Up Modal State
  const [signUpModalOpen, setSignUpModalOpen] = useState(false);
  const [signUpForm, setSignUpForm] = useState({ fullName: '', email: '', phone: '', warrantNumber: 'JP-', password: '', confirmPassword: '', isProvisional: false });
  const [signUpSuccessMsg, setSignUpSuccessMsg] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showSignUpConfirmPassword, setShowSignUpConfirmPassword] = useState(false);
  const [signUpPasswordError, setSignUpPasswordError] = useState('');

  // Forgot Password & Reset Modal State
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLinkSent, setResetLinkSent] = useState(false);

  const [resetScreenOpen, setResetScreenOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  // MY SHIFTS TAB FILTERS
  const [myShiftsPreset, setMyShiftsPreset] = useState('DEFAULT_5WEEKS');
  const [myShiftsDeskFilter, setMyShiftsDeskFilter] = useState('ALL');
  const [myShiftsCustomModalOpen, setMyShiftsCustomModalOpen] = useState(false);
  const [myShiftsCustomFrom, setMyShiftsCustomFrom] = useState('2026-08-31');
  const [myShiftsCustomTo, setMyShiftsCustomTo] = useState('2026-10-04');

  // STATISTICS TAB FILTERS
  const [statsRegionFilter, setStatsRegionFilter] = useState('ALL');
  const [statsDeskFilter, setStatsDeskFilter] = useState('ALL');
  const [statsJpFilter, setStatsJpFilter] = useState('ALL');
  const [statsDatePreset, setStatsDatePreset] = useState('CURRENT_AND_PREVIOUS'); 
  const [customDateModalOpen, setCustomDateModalOpen] = useState(false);
  const [customFromDate, setCustomFromDate] = useState('2026-08-01');
  const [customToDate, setCustomToDate] = useState('2026-09-30');

  // EDITING EXISTING STATS RECORD MODAL
  const [editingStatRecord, setEditingStatRecord] = useState(null);
  const [editStatForm, setEditStatForm] = useState({
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

  // Full Slot Details Modal State
  const [detailedSlotModal, setDetailedSlotModal] = useState(null);

  // Registrar Portal Subtab State
  const [registrarSubTab, setRegistrarSubTab] = useState('members');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState({ fullName: '', email: '', phone: '', warrantNumber: '', password: 'password123', role: 'Member', isProvisional: false, status: 'Approved' });
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState(null);

  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [editingRegionId, setEditingRegionId] = useState(null);
  const [regionForm, setRegionForm] = useState({ name: '', code: '' });
  const [pendingDeleteRegionId, setPendingDeleteRegionId] = useState(null);

  // REGISTRAR MASTER DOWNLOAD CONFIRMATION MODAL STATE
  const [confirmDownloadModalOpen, setConfirmDownloadModalOpen] = useState(false);

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
    setPreferencesReadyForProfile(null);
    const roster = await fetchRosterData(profile.id);
    setUsers(roster.users); setRegions(roster.regions); setServiceDesks(roster.desks); setSlotTemplates(roster.slots);
    setFollowedDesks(roster.followedDesks); setSlotAssignments(roster.assignments);
    setRecurringRules(roster.rules); setLoggedStatistics(roster.statistics);
    setStatutoryHolidays(roster.statutoryHolidays); setSlotHolidayOverrides(roster.slotHolidayOverrides);

    if (profile.role === 'Admin' || profile.role === 'Registrar') {
      try {
        setRosterActivityAudit(await fetchRosterActivityAudit());
        setRosterActivityAuditError('');
      } catch (auditError) {
        // The rest of the portal stays available until the audit migration has
        // been applied. The screen explains this to the authorised user.
        console.warn('Roster activity audit could not be loaded:', auditError.message);
        setRosterActivityAudit([]);
        setRosterActivityAuditError(auditError.message);
      }
    } else {
      setRosterActivityAudit([]);
      setRosterActivityAuditError('');
    }

    // Reset to the familiar defaults first. The saved values below then take
    // precedence where they exist, including when another account signs in on
    // the same browser.
    setCalendarDeskFilter(profile.role === 'Member' ? 'FOLLOWED' : 'ALL');
    setMemberCalendarDeskIds(profile.role === 'Member' ? roster.followedDesks : []);
    setCalendarRegionFilter('ALL');
    setCalendarTimeOfDayFilter({ ...DEFAULT_TIME_OF_DAY_FILTER });
    setCalendarDayFilter({ ...DEFAULT_DAY_FILTER });
    setMyShiftsPreset('DEFAULT_5WEEKS');
    setMyShiftsDeskFilter('ALL');
    setStatsRegionFilter('ALL');
    setStatsDeskFilter('ALL');
    setStatsJpFilter(profile.role === 'Member' ? profile.id : 'ALL');
    setStatsDatePreset('CURRENT_AND_PREVIOUS');

    if (roster.preferencesError) {
      // Do not prevent sign-in if Stage 4A has not yet been run in Supabase.
      console.warn('User preferences were not loaded:', roster.preferencesError.message);
    } else if (roster.preferences) {
      const calendar = roster.preferences.calendar_filters || {};
      const myShifts = roster.preferences.my_shifts_filters || {};
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
      if (typeof myShifts.preset === 'string') setMyShiftsPreset(myShifts.preset);
      if (typeof myShifts.desk === 'string') setMyShiftsDeskFilter(myShifts.desk);
      if (typeof myShifts.from === 'string') setMyShiftsCustomFrom(myShifts.from);
      if (typeof myShifts.to === 'string') setMyShiftsCustomTo(myShifts.to);
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
        const restoredUser = await getCurrentApprovedUser();
        if (!restoredUser || !isMounted) return;

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
      } finally {
        if (isMounted) setAuthRestoring(false);
      }
    };

    restoreSession();
    return () => { isMounted = false; };
  }, []);

  // A single-page app has no browser history entries for its tabs. Add a
  // portal entry while signed in so Android Back returns to the Calendar (and
  // closes any open action window) instead of immediately closing the app.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const portalHistoryState = { ajpaPortal: true };
    window.history.pushState(portalHistoryState, '', window.location.href);
    const handleBrowserBack = () => {
      setRegisterModalOcc(null);
      setWithdrawModalOcc(null);
      setDetailedSlotModal(null);
      setLogStatsOccurrence(null);
      setActiveTab('calendar');
      window.history.pushState(portalHistoryState, '', window.location.href);
    };

    window.addEventListener('popstate', handleBrowserBack);
    return () => window.removeEventListener('popstate', handleBrowserBack);
  }, [isAuthenticated]);

  const handleToggleFollowDesk = async (deskId) => {
    if (!currentUser) return;
    const isFollowed = followedDesks.includes(deskId);
    const query = isFollowed
      ? supabase.from('desk_follows').delete().eq('profile_id', currentUser.id).eq('desk_id', deskId)
      : supabase.from('desk_follows').insert({ profile_id: currentUser.id, desk_id: deskId });
    const { error } = await query;
    if (error) { alert(`Unable to update followed desks: ${error.message}`); return; }
    setFollowedDesks(previous => isFollowed ? previous.filter(id => id !== deskId) : [...previous, deskId]);
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
          days: calendarDayFilter
        },
        my_shifts_filters: {
          preset: myShiftsPreset,
          desk: myShiftsDeskFilter,
          from: myShiftsCustomFrom,
          to: myShiftsCustomTo
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
    myShiftsPreset,
    myShiftsDeskFilter,
    myShiftsCustomFrom,
    myShiftsCustomTo,
    statsRegionFilter,
    statsDeskFilter,
    statsJpFilter,
    statsDatePreset,
    customFromDate,
    customToDate
  ]);

  const canManage = useMemo(() => {
    return currentUser?.role === 'Admin' || currentUser?.role === 'Registrar';
  }, [currentUser]);

  const canViewActivityAudit = useMemo(() => {
    return currentUser?.role === 'Admin' || currentUser?.role === 'Registrar';
  }, [currentUser]);

  const isCurrentUserDeskAdmin = useMemo(() => {
    if (!currentUser) return false;
    return serviceDesks.some(desk => desk.primaryAdminId === currentUser.id || desk.secondaryAdminId === currentUser.id);
  }, [currentUser, serviceDesks]);

  useEffect(() => {
    if (!currentUser) return;
    setProfileForm({
      email: currentUser.email || '',
      phone: currentUser.phone || '',
      reminderFrequency: currentUser.reminderFrequency || 'NONE',
      reminderStartDate: currentUser.reminderStartDate || '',
      reminderWeeks: currentUser.reminderWeeks || 4
    });
    setProfileSaveMessage('');
    setProfileSaveError('');
  }, [currentUser]);

  const eligibleAdminsList = useMemo(() => {
    return users.filter(u => (u.role === 'Admin' || u.role === 'Registrar') && u.status === 'Approved');
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

  const activeDeskMap = useMemo(() => {
    return serviceDesks.reduce((acc, desk) => {
      acc[desk.id] = desk;
      return acc;
    }, {});
  }, [serviceDesks]);

  const activeDesksList = useMemo(() => {
    return serviceDesks.filter(d => d.status === 'Active');
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
    return serviceDesks.filter(d => d.status === 'Archived');
  }, [serviceDesks]);

  const handleExecuteFullDataDownload = () => {
    setConfirmDownloadModalOpen(false);

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
    
    const assignmentsArray = Object.entries(slotAssignments).map(([instanceKey, assignedJpIds]) => ({
      instanceKey,
      assignedJpIds: JSON.stringify(assignedJpIds)
    }));
    triggerDownload(`${timestamp}_5.csv`, convertToCsv(assignmentsArray, ['instanceKey', 'assignedJpIds']));
    triggerDownload(`${timestamp}_6.csv`, convertToCsv(loggedStatistics, ['id', 'jpId', 'jpName', 'warrantNumber', 'deskId', 'deskName', 'deskCode', 'region', 'slotId', 'occurrenceKey', 'date', 'startTime', 'endTime', 'noOfJpDuties', 'noOfClients', 'noOfHoursWorked', 'certifiedCopies', 'statutoryDeclarations', 'signatureWitnessed', 'affidavits', 'other', 'notes']));
    triggerDownload(`${timestamp}_7.csv`, convertToCsv(statutoryHolidays, ['id', 'date', 'description']));
    triggerDownload(`${timestamp}_8.csv`, convertToCsv(slotHolidayOverrides, ['slotId', 'date', 'isHoliday']));
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');

    let foundUser;
    try {
      foundUser = await signInApprovedUser(loginEmail, loginPassword);
    } catch (loginError) {
      setLoginError(loginError.message);
      return;
    }
    let roster;
    try { roster = await loadSupabaseRoster(foundUser); } catch (loadError) { await supabase.auth.signOut(); setLoginError(`Unable to load roster data: ${loadError.message}`); return; }
    setCurrentUser(foundUser);
    setIsAuthenticated(true);
    setLoginEmail('');
    setLoginPassword('');

    if (foundUser.role === 'Registrar') {
      const pendingCount = roster.users.filter(u => u.status === 'Pending').length;
      if (pendingCount > 0) {
        setPendingMembersNoticeCount(pendingCount);
      } else {
        setActiveTab('calendar');
      }
    } else {
      setActiveTab('calendar');
    }
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

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setSignUpPasswordError('');
    const fullName = signUpForm.fullName.trim();
    const email = signUpForm.email.trim().toLowerCase();
    const warrantNumber = signUpForm.warrantNumber.trim().toUpperCase();
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
    const { error } = await supabase.auth.signUp({
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
    setSignUpSuccessMsg(true);

    setTimeout(() => {
      setSignUpSuccessMsg(false);
      setSignUpModalOpen(false);
      setSignUpForm({ fullName: '', email: '', phone: '', warrantNumber: 'JP-', password: '', confirmPassword: '', isProvisional: false });
      setSignUpPasswordError('');
    }, 2500);
  };

  const handleSendResetLink = async (e) => {
    e.preventDefault();
    try {
      await requestPasswordReset(resetEmail, window.location.origin);
    } catch (resetRequestError) {
      if (resetRequestError.message === 'NO_REGISTERED_ACCOUNT') {
        alert('No account was found for that email address. Please check the address and try again, or register for access.');
        return;
      }
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
    setResetEmail('');
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (signOutError) {
      console.warn('Unable to fully sign out:', signOutError.message);
    }
    setIsAuthenticated(false);
    setCurrentUser(null);
    setPreferencesReadyForProfile(null);
    setShowUnauthHelp(false);
  };

  const handleSaveMyProfile = async (event) => {
    event.preventDefault();
    if (!currentUser) return;

    const email = profileForm.email.trim().toLowerCase();
    const phone = profileForm.phone.trim();
    const reminderFrequency = isCurrentUserDeskAdmin ? profileForm.reminderFrequency : 'NONE';
    const reminderStartDate = isCurrentUserDeskAdmin && reminderFrequency !== 'NONE' ? profileForm.reminderStartDate : null;
    const reminderWeeks = isCurrentUserDeskAdmin ? Math.max(1, Math.min(52, Number(profileForm.reminderWeeks) || 1)) : 4;

    if (!email) {
      setProfileSaveError('Please enter an email address.');
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
        p_reminder_frequency: reminderFrequency,
        p_reminder_start_date: reminderStartDate,
        p_reminder_weeks: reminderWeeks
      });
      if (profileError) throw profileError;

      setCurrentUser(previous => ({
        ...previous,
        email: emailChangePending ? previous.email : email,
        phone,
        reminderFrequency,
        reminderStartDate: reminderStartDate || '',
        reminderWeeks
      }));
      setProfileForm(previous => ({ ...previous, phone, reminderFrequency, reminderStartDate: reminderStartDate || '', reminderWeeks }));
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
    const { error } = await supabase.from('profiles').update({ status: 'Approved' }).eq('id', userId);
    if (error) { alert(`Unable to approve member: ${error.message}`); return; }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'Approved' } : u));
  };

  const handleRejectPendingUser = async (userId) => {
    const { error } = await supabase.from('profiles').update({ status: 'Rejected' }).eq('id', userId);
    if (error) { alert(`Unable to reject member: ${error.message}`); return; }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'Rejected' } : u));
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
    if (!canManage) return;
    setEditingSlotId(null);
    setSlotValidationError('');
    setSlotForm({
      deskId: targetDeskId || activeDesksList[0]?.id || 'desk-remuera',
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
    if (!canManage) return;
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
    if (!canManage && slotActionConfirm !== 'CANCEL') {
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

  const filteredStatisticsList = useMemo(() => {
    if (!currentUser) return [];

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); 

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

      const statDate = new Date(stat.date);
      const statYear = statDate.getFullYear();
      const statMonth = statDate.getMonth();

      if (statsDatePreset === 'CURRENT_AND_PREVIOUS') {
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        const isCurrentMonth = statYear === currentYear && statMonth === currentMonth;
        const isPrevMonth = statYear === prevYear && statMonth === prevMonth;
        if (!isCurrentMonth && !isPrevMonth) return false;
      } 
      else if (statsDatePreset === 'CURRENT_MONTH') {
        if (statYear !== currentYear || statMonth !== currentMonth) return false;
      } 
      else if (statsDatePreset === 'LAST_MONTH') {
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        if (statYear !== prevYear || statMonth !== prevMonth) return false;
      } 
      else if (statsDatePreset === 'LAST_30_DAYS') {
        const diffTime = today.getTime() - statDate.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);
        if (diffDays < 0 || diffDays > 30) return false;
      } 
      else if (statsDatePreset === 'CUSTOM') {
        const from = new Date(customFromDate);
        const to = new Date(customToDate);
        to.setHours(23, 59, 59, 999);
        if (statDate < from || statDate > to) return false;
      }

      return true;
    });
  }, [loggedStatistics, currentUser, statsRegionFilter, statsDeskFilter, statsJpFilter, statsDatePreset, customFromDate, customToDate]);

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

  const handleOpenEditStatModal = (statRecord) => {
    setEditingStatRecord(statRecord);
    setEditStatForm({
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

  const handleSaveEditedStatSubmit = (e) => {
    e.preventDefault();
    if (!editingStatRecord) return;

    setLoggedStatistics(prev => prev.map(item => {
      if (item.id === editingStatRecord.id) {
        return {
          ...item,
          ...editStatForm
        };
      }
      return item;
    }));

    setEditingStatRecord(null);
    setStatsSuccessToast(true);
    setTimeout(() => setStatsSuccessToast(false), 3000);
  };

  const confirmDeleteStatRecord = () => {
    if (!confirmDeleteStatId) return;
    setLoggedStatistics(prev => prev.filter(item => item.id !== confirmDeleteStatId));
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

  const rolling12Weeks = useMemo(() => {
    const weeks = [];
    const dayNameMap = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 0: 'Sunday' };
    const baseMonday = new Date(currentWeek1Monday);

    for (let w = 0; w < 12; w++) {
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
  }, [currentWeek1Monday]);

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

  const canManageHolidayForDesk = (deskId) => {
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
        if (!parentDesk || parentDesk.status !== 'Active') return;

        if (template.status === 'Active' && template.dayOfWeek === fullDayName) {
          const instanceKey = `${template.deskId}_${template.id}_${isoDate}`;
          const overrideKey = `${template.id}_${isoDate}`;
          const statutoryHoliday = statutoryHolidayByDate[isoDate];
          const isHoliday = Object.prototype.hasOwnProperty.call(slotHolidayOverrideByKey, overrideKey)
            ? slotHolidayOverrideByKey[overrideKey]
            : Boolean(statutoryHoliday);

          if (!cancelledSlotInstances.includes(instanceKey)) {
            let assignedJpIds = [...(slotAssignments[instanceKey] || [])];

            // AUTO-ROLLOVER RECURRING RULES ENGINE
            if (currentUser && !isHoliday) {
              const matchingRules = recurringRules.filter(r => r.userId === currentUser.id && r.slotId === template.id);
              for (const rule of matchingRules) {
                let matches = false;
                if (rule.type === 'ALL_FUTURE' && isoDate >= rule.startDate) {
                  matches = true;
                } else if (rule.type === 'UNTIL_DATE' && isoDate >= rule.startDate && isoDate <= rule.untilDate) {
                  matches = true;
                } else if (rule.type === 'NEXT_N' && isoDate >= rule.startDate) {
                  // Filter future occurrence dates for this slotTemplate
                  const slotOccurrences = [];
                  for (let tempD = new Date(rule.startDate); tempD <= rangeEnd; tempD.setDate(tempD.getDate() + 1)) {
                    if (dayNameMap[tempD.getDay()] === template.dayOfWeek) {
                      const y = tempD.getFullYear();
                      const m = String(tempD.getMonth() + 1).padStart(2, '0');
                      const da = String(tempD.getDate()).padStart(2, '0');
                      slotOccurrences.push(`${y}-${m}-${da}`);
                    }
                  }
                  const targetDates = slotOccurrences.slice(0, rule.countN);
                  if (targetDates.includes(isoDate)) {
                    matches = true;
                  }
                }

                if (matches) {
                  if (rule.action === 'REGISTER' && !assignedJpIds.includes(currentUser.id)) {
                    if (assignedJpIds.length < template.maxJps) {
                      assignedJpIds.push(currentUser.id);
                    }
                  } else if (rule.action === 'WITHDRAW' && assignedJpIds.includes(currentUser.id)) {
                    assignedJpIds = assignedJpIds.filter(id => id !== currentUser.id);
                  }
                }
              }
            }

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
              assignedJpIds,
              isHoliday,
              holidayDescription: statutoryHoliday?.description || ''
            });
          }
        }
      });
    }

    return instances;
  }, [currentWeek1Monday, slotTemplates, cancelledSlotInstances, slotAssignments, activeDeskMap, currentUser, recurringRules, statutoryHolidayByDate, slotHolidayOverrideByKey]);

  // MY SHIFTS DATE RANGE & COMPUTED FILTERED LIST
  const myShiftsFilterDescriptor = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const formatDateStr = (d) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    if (myShiftsPreset === 'DEFAULT_5WEEKS') {
      const start = new Date(currentWeek1Monday);
      start.setDate(start.getDate() - 7);
      const end = new Date(currentWeek1Monday);
      end.setDate(end.getDate() + (28 + 6));
      return {
        label: `Showing my shifts for 5-week window: Prior Week + Calendar Weeks 1-4 (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: start.toISOString().split('T')[0],
        endDateStr: end.toISOString().split('T')[0]
      };
    } 
    else if (myShiftsPreset === 'THIS_MONTH') {
      const start = new Date(currentYear, currentMonth, 1);
      const end = new Date(currentYear, currentMonth + 1, 0);
      return {
        label: `Showing my shifts for This Month (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: start.toISOString().split('T')[0],
        endDateStr: end.toISOString().split('T')[0]
      };
    } 
    else if (myShiftsPreset === 'LAST_MONTH') {
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const start = new Date(prevYear, prevMonth, 1);
      const end = new Date(prevYear, prevMonth + 1, 0);
      return {
        label: `Showing my shifts for Last Month (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: start.toISOString().split('T')[0],
        endDateStr: end.toISOString().split('T')[0]
      };
    } 
    else if (myShiftsPreset === 'NEXT_MONTH') {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const start = new Date(nextYear, nextMonth, 1);
      const end = new Date(nextYear, nextMonth + 1, 0);
      return {
        label: `Showing my shifts for Next Month (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: start.toISOString().split('T')[0],
        endDateStr: end.toISOString().split('T')[0]
      };
    } 
    else if (myShiftsPreset === 'CUSTOM') {
      const start = new Date(myShiftsCustomFrom);
      const end = new Date(myShiftsCustomTo);
      return {
        label: `Showing my shifts for Custom Date Range (${formatDateStr(start)} to ${formatDateStr(end)})`,
        startDateStr: myShiftsCustomFrom,
        endDateStr: myShiftsCustomTo
      };
    }

    return { label: 'Showing registered shifts', startDateStr: '1970-01-01', endDateStr: '2099-12-31' };
  }, [myShiftsPreset, currentWeek1Monday, myShiftsCustomFrom, myShiftsCustomTo]);

  const myShiftsFilteredList = useMemo(() => {
    if (!currentUser) return [];

    return generatedOccurrences.filter(occ => {
      if (!occ.assignedJpIds.includes(currentUser.id)) return false;
      if (myShiftsDeskFilter !== 'ALL' && occ.deskId !== myShiftsDeskFilter) return false;
      return occ.date >= myShiftsFilterDescriptor.startDateStr && occ.date <= myShiftsFilterDescriptor.endDateStr;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [generatedOccurrences, currentUser, myShiftsFilterDescriptor, myShiftsDeskFilter]);

  const loggedStatisticKeys = useMemo(() => new Set(
    loggedStatistics.map(stat => `${stat.jpId}:${stat.slotId}:${stat.date}`)
  ), [loggedStatistics]);

  const hasLoggedStatisticsForOccurrence = (occurrence) => (
    Boolean(currentUser) && loggedStatisticKeys.has(`${currentUser.id}:${occurrence.slotId}:${occurrence.date}`)
  );

  const isOccurrenceFinished = (occurrence) => hasShiftEnded(occurrence, actionClock);

  const handleOpenLogStatsModal = (occ, e) => {
    if (e) e.stopPropagation();
    if (!isOccurrenceFinished(occ)) {
      alert('Statistics can be logged after this shift has ended.');
      return;
    }
    if (hasLoggedStatisticsForOccurrence(occ)) {
      alert('Statistics have already been logged for this shift. To maintain them, open the Statistics tab.');
      return;
    }
    setLogStatsOccurrence(occ);

    let defaultHours = 2.00;
    try {
      const [startH, startM] = occ.startTime.split(':').map(Number);
      const [endH, endM] = occ.endTime.split(':').map(Number);
      const diff = (endH * 60 + endM) - (startH * 60 + startM);
      if (diff > 0) defaultHours = parseFloat((diff / 60).toFixed(2));
    } catch (err) {}

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
    if (!logStatsOccurrence || !currentUser) return;
    if (hasLoggedStatisticsForOccurrence(logStatsOccurrence)) {
      alert('Statistics have already been logged for this shift. To maintain them, open the Statistics tab.');
      setLogStatsOccurrence(null);
      return;
    }

    const desk = activeDeskMap[logStatsOccurrence.deskId] || {};

    const newStatEntry = {
      id: `stat-${Date.now()}`,
      jpId: currentUser.id,
      jpName: currentUser.fullName,
      warrantNumber: currentUser.warrantNumber,
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

    const { data: savedStat, error } = await supabase.from('duty_statistics').insert({
      slot_id: logStatsOccurrence.slotId,
      duty_date: logStatsOccurrence.date,
      profile_id: currentUser.id,
      desk_name_snapshot: newStatEntry.deskName,
      desk_code_snapshot: newStatEntry.deskCode,
      start_time_snapshot: newStatEntry.startTime,
      end_time_snapshot: newStatEntry.endTime,
      no_of_jp_duties: newStatEntry.noOfJpDuties,
      no_of_clients: newStatEntry.noOfClients,
      no_of_hours_worked: newStatEntry.noOfHoursWorked,
      certified_copies: newStatEntry.certifiedCopies,
      statutory_declarations: newStatEntry.statutoryDeclarations,
      signatures_witnessed: newStatEntry.signatureWitnessed,
      affidavits: newStatEntry.affidavits,
      other_duties: newStatEntry.other,
      notes: newStatEntry.notes
    }).select().single();
    if (error) { alert(`Unable to save statistics: ${error.message}`); return; }
    setLoggedStatistics(prev => [{ ...newStatEntry, id: savedStat.id, slotId: logStatsOccurrence.slotId, occurrenceKey: logStatsOccurrence.instanceKey }, ...prev]);
    setLogStatsOccurrence(null);
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
    setRegisterModalOcc(occ);
    setRegisterOption('SINGLE');
    setRegisterCountN(4);
    setRegisterUntilDate(occ.date);
  };

  // EXECUTE REGISTRATION LOGIC
  const handleExecuteRegister = async () => {
    if (!registerModalOcc || !currentUser) return;
    if (registerModalOcc.isHoliday) {
      alert('This slot is marked as a Holiday and cannot be registered for.');
      return;
    }

    const slotOccurrences = generatedOccurrences
      .filter(o => o.slotId === registerModalOcc.slotId && o.date >= registerModalOcc.date && !o.isHoliday)
      .sort((a, b) => a.date.localeCompare(b.date));

    let targetOccurrences = [];

    if (registerOption === 'SINGLE') {
      targetOccurrences = [registerModalOcc];
    } else if (registerOption === 'NEXT_N') {
      targetOccurrences = slotOccurrences.slice(0, Math.max(1, parseInt(registerCountN, 10) || 1));
    } else if (registerOption === 'UNTIL_DATE') {
      targetOccurrences = slotOccurrences.filter(o => o.date <= registerUntilDate);
    } else if (registerOption === 'ALL_FUTURE') {
      targetOccurrences = slotOccurrences;
    }

    // A single-date withdrawal is stored as a one-occurrence WITHDRAW rule so
    // it can override a previous recurring registration. If the member later
    // registers for that same date again, remove the old override first;
    // otherwise the database assignment exists but the calendar correctly
    // applies the stale rule and hides it from the member.
    if (registerOption === 'SINGLE') {
      const { error: clearWithdrawalOverrideError } = await supabase
        .from('recurring_rules')
        .delete()
        .eq('profile_id', currentUser.id)
        .eq('slot_id', registerModalOcc.slotId)
        .eq('action', 'WITHDRAW')
        .eq('rule_type', 'NEXT_N')
        .eq('start_date', registerModalOcc.date)
        .eq('count_n', 1);

      if (clearWithdrawalOverrideError) {
        alert(`Unable to prepare this slot for re-registration: ${clearWithdrawalOverrideError.message}`);
        return;
      }
    }

    const registrationResults = await Promise.all(targetOccurrences.map(occ => supabase.rpc('register_for_duty', { p_slot_id: occ.slotId, p_duty_date: occ.date })));
    const failedRegistration = registrationResults.find(result => result.error);
    if (failedRegistration) { alert(`Unable to register: ${failedRegistration.error.message}`); return; }

    setSlotAssignments(prev => {
      const updated = { ...prev };
      targetOccurrences.forEach(occ => {
        const currentAssigned = updated[occ.instanceKey] || [];
        if (!currentAssigned.includes(currentUser.id) && currentAssigned.length < occ.maxJps) {
          updated[occ.instanceKey] = [...currentAssigned, currentUser.id];
        }
      });
      return updated;
    });

    if (registerOption !== 'SINGLE') {
      const { error: removeRuleError } = await supabase
        .from('recurring_rules')
        .delete()
        .eq('profile_id', currentUser.id)
        .eq('slot_id', registerModalOcc.slotId)
        .eq('action', 'REGISTER');
      if (removeRuleError) { alert(`Registration saved, but the recurring rule could not be updated: ${removeRuleError.message}`); return; }

      const rulePayload = {
        profile_id: currentUser.id,
        slot_id: registerModalOcc.slotId,
        action: 'REGISTER',
        rule_type: registerOption,
        start_date: registerModalOcc.date,
        until_date: registerOption === 'UNTIL_DATE' ? registerUntilDate : null,
        count_n: registerOption === 'NEXT_N' ? (parseInt(registerCountN, 10) || 1) : null
      };
      const { data: savedRule, error: saveRuleError } = await supabase
        .from('recurring_rules')
        .insert(rulePayload)
        .select()
        .single();
      if (saveRuleError) { alert(`Registration saved, but the recurring rule could not be saved: ${saveRuleError.message}`); return; }

      const newRule = {
        id: savedRule.id,
        userId: savedRule.profile_id,
        slotId: savedRule.slot_id,
        action: savedRule.action,
        type: savedRule.rule_type,
        startDate: savedRule.start_date,
        countN: savedRule.count_n,
        untilDate: savedRule.until_date
      };
      setRecurringRules(prev => [...prev.filter(r => !(r.userId === currentUser.id && r.slotId === registerModalOcc.slotId && r.action === 'REGISTER')), newRule]);
    }

    // Reload from Supabase rather than relying only on the optimistic update.
    // This keeps the Calendar and My Shifts views identical to the persisted
    // roster, including after a withdrawal followed by a re-registration.
    await loadSupabaseRoster(currentUser);
    setRegisterModalOcc(null);
  };

  // OPEN WITHDRAWAL MODAL
  const handleOpenWithdrawModal = (occ, e) => {
    if (e) e.stopPropagation();
    if (isOccurrenceFinished(occ)) {
      alert('This shift has already finished and can no longer be withdrawn from.');
      return;
    }
    setWithdrawModalOcc(occ);
    setWithdrawOption('SINGLE');
    setWithdrawCountN(4);
    setWithdrawUntilDate(occ.date);
  };

  // EXECUTE WITHDRAWAL LOGIC
  const handleExecuteWithdraw = async () => {
    if (!withdrawModalOcc || !currentUser) return;
    if (isOccurrenceFinished(withdrawModalOcc)) {
      alert('This shift has already finished and can no longer be withdrawn from.');
      setWithdrawModalOcc(null);
      return;
    }

    const slotOccurrences = generatedOccurrences
      .filter(o => o.slotId === withdrawModalOcc.slotId && o.date >= withdrawModalOcc.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    let targetOccurrences = [];

    if (withdrawOption === 'SINGLE') {
      targetOccurrences = [withdrawModalOcc];
    } else if (withdrawOption === 'NEXT_N') {
      targetOccurrences = slotOccurrences.slice(0, Math.max(1, parseInt(withdrawCountN, 10) || 1));
    } else if (withdrawOption === 'UNTIL_DATE') {
      targetOccurrences = slotOccurrences.filter(o => o.date <= withdrawUntilDate);
    } else if (withdrawOption === 'ALL_FUTURE') {
      targetOccurrences = slotOccurrences;
    }

    const withdrawalResults = await Promise.all(targetOccurrences.map(occ => supabase
      .from('duty_assignments')
      .delete()
      .eq('slot_id', occ.slotId)
      .eq('duty_date', occ.date)
      .eq('profile_id', currentUser.id)
      .select('slot_id, duty_date, profile_id')));
    const failedWithdrawal = withdrawalResults.find(result => result.error);
    if (failedWithdrawal) { alert(`Unable to withdraw: ${failedWithdrawal.error.message}`); return; }

    setSlotAssignments(prev => {
      const updated = { ...prev };
      targetOccurrences.forEach(occ => {
        const currentAssigned = updated[occ.instanceKey] || [];
        if (currentAssigned.includes(currentUser.id)) {
          updated[occ.instanceKey] = currentAssigned.filter(id => id !== currentUser.id);
        }
      });
      return updated;
    });

    if (withdrawOption !== 'SINGLE') {
      const { error: removeRuleError } = await supabase
        .from('recurring_rules')
        .delete()
        .eq('profile_id', currentUser.id)
        .eq('slot_id', withdrawModalOcc.slotId)
        .eq('action', 'WITHDRAW');
      if (removeRuleError) { alert(`Withdrawal saved, but the recurring rule could not be updated: ${removeRuleError.message}`); return; }

      const rulePayload = {
        profile_id: currentUser.id,
        slot_id: withdrawModalOcc.slotId,
        action: 'WITHDRAW',
        rule_type: withdrawOption,
        start_date: withdrawModalOcc.date,
        until_date: withdrawOption === 'UNTIL_DATE' ? withdrawUntilDate : null,
        count_n: withdrawOption === 'NEXT_N' ? (parseInt(withdrawCountN, 10) || 1) : null
      };
      const { data: savedRule, error: saveRuleError } = await supabase
        .from('recurring_rules')
        .insert(rulePayload)
        .select()
        .single();
      if (saveRuleError) { alert(`Withdrawal saved, but the recurring rule could not be saved: ${saveRuleError.message}`); return; }

      const newRule = {
        id: savedRule.id,
        userId: savedRule.profile_id,
        slotId: savedRule.slot_id,
        action: savedRule.action,
        type: savedRule.rule_type,
        startDate: savedRule.start_date,
        countN: savedRule.count_n,
        untilDate: savedRule.until_date
      };
      setRecurringRules(prev => [...prev.filter(r => !(r.userId === currentUser.id && r.slotId === withdrawModalOcc.slotId && r.action === 'WITHDRAW')), newRule]);
    } else {
      // Record a one-occurrence withdrawal in Supabase. This overrides a
      // repeating registration on every device without changing the other
      // dates covered by that registration.
      const { error: removeOneOffRuleError } = await supabase
        .from('recurring_rules')
        .delete()
        .eq('profile_id', currentUser.id)
        .eq('slot_id', withdrawModalOcc.slotId)
        .eq('action', 'WITHDRAW')
        .eq('rule_type', 'NEXT_N')
        .eq('start_date', withdrawModalOcc.date)
        .eq('count_n', 1);
      if (removeOneOffRuleError) {
        alert(`Unable to update the one-off withdrawal: ${removeOneOffRuleError.message}`);
        return;
      }

      const { error: saveOneOffRuleError } = await supabase
        .from('recurring_rules')
        .insert({
          profile_id: currentUser.id,
          slot_id: withdrawModalOcc.slotId,
          action: 'WITHDRAW',
          rule_type: 'NEXT_N',
          start_date: withdrawModalOcc.date,
          count_n: 1,
          until_date: null
        });
      if (saveOneOffRuleError) {
        alert(`Withdrawal saved, but the one-off withdrawal could not be recorded: ${saveOneOffRuleError.message}`);
        return;
      }
    }

    await loadSupabaseRoster(currentUser);
    setWithdrawModalOcc(null);
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
      warrantNumber: 'JP-',
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
      warrantNumber: u.warrantNumber,
      password: u.password || 'password123',
      role: u.role,
      isProvisional: u.isProvisional,
      status: u.status
    });
    setUserModalOpen(true);
  };

  const handleSaveUserSubmit = async (e) => {
    e.preventDefault();
    if (editingUserId) {
      const { error } = await supabase.from('profiles').update({ full_name: userForm.fullName, phone: userForm.phone, warrant_number: userForm.warrantNumber, role: userForm.role, is_provisional: userForm.isProvisional, status: userForm.status }).eq('id', editingUserId);
      if (error) { alert(`Unable to save member: ${error.message}`); return; }
      setUsers(prev => prev.map(u => u.id === editingUserId ? { ...u, ...userForm } : u));
    } else {
      alert('Create new accounts through the Supabase sign-up process. They will appear here as Pending for approval.');
      return;
    }
    setUserModalOpen(false);
  };

  const confirmDeleteUser = () => {
    setUsers(prev => prev.filter(u => u.id !== pendingDeleteUserId));
    setPendingDeleteUserId(null);
  };

  const handleOpenAddRegionModal = () => {
    setEditingRegionId(null);
    setRegionForm({ name: '', code: '' });
    setRegionModalOpen(true);
  };

  const handleOpenEditRegionModal = (r) => {
    setEditingRegionId(r.id);
    setRegionForm({ name: r.name, code: r.code });
    setRegionModalOpen(true);
  };

  const handleSaveRegionSubmit = async (e) => {
    e.preventDefault();
    if (editingRegionId) {
      const oldRegion = regions.find(r => r.id === editingRegionId);
      const { error } = await supabase.from('regions').update({ name: regionForm.name, code: regionForm.code }).eq('id', editingRegionId);
      if (error) { alert(`Unable to save region: ${error.message}`); return; }
      setRegions(prev => prev.map(r => r.id === editingRegionId ? { ...r, ...regionForm } : r));
      
      if (oldRegion && oldRegion.name !== regionForm.name) {
        setServiceDesks(prev => prev.map(d => d.region === oldRegion.name ? { ...d, region: regionForm.name } : d));
      }
    } else {
      const { data: newReg, error } = await supabase.from('regions').insert({ name: regionForm.name, code: regionForm.code }).select().single();
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

    if (newDeskForm.primaryAdminId && newDeskForm.primaryAdminId === newDeskForm.secondaryAdminId) {
      alert('Primary Admin and Secondary Admin cannot be the same person.');
      return;
    }

    const region = regions.find(item => item.name === newDeskForm.region) || regions[0];
    const { error } = await supabase.from('service_desks').insert({ code: newDeskForm.code.toUpperCase(), name: newDeskForm.name, address: newDeskForm.address, region_id: region.id, primary_admin_id: newDeskForm.primaryAdminId || null, secondary_admin_id: newDeskForm.secondaryAdminId || null, site_contact_name: newDeskForm.siteContactName || '', site_contact_email: newDeskForm.siteContactEmail || '', contact_person: newDeskForm.contactPerson || '', notes: newDeskForm.notes || '' });
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

  const handleStartEditDesk = (desk) => {
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

    if (editDeskForm.primaryAdminId && editDeskForm.primaryAdminId === editDeskForm.secondaryAdminId) {
      alert('Primary Admin and Secondary Admin cannot be the same person.');
      return;
    }

    const region = regions.find(item => item.name === editDeskForm.region) || regions[0];
    const { error } = await supabase.from('service_desks').update({ code: editDeskForm.code.toUpperCase(), name: editDeskForm.name, address: editDeskForm.address, region_id: region.id, primary_admin_id: editDeskForm.primaryAdminId || null, secondary_admin_id: editDeskForm.secondaryAdminId || null, site_contact_name: editDeskForm.siteContactName || '', site_contact_email: editDeskForm.siteContactEmail || '', contact_person: editDeskForm.contactPerson || '', notes: editDeskForm.notes || '' }).eq('id', editingDeskId);
    if (error) { alert(`Unable to save service desk: ${error.message}`); return; }
    await loadSupabaseRoster(currentUser);
    setEditingDeskId(null);
  };

  const confirmDeleteDesk = async () => {
    const { error } = await supabase.from('service_desks').update({ status: 'Archived' }).eq('id', pendingDeleteDeskId);
    if (error) { alert(`Unable to archive service desk: ${error.message}`); return; }
    await loadSupabaseRoster(currentUser);
    setPendingDeleteDeskId(null);
    if (editingDeskId === pendingDeleteDeskId) setEditingDeskId(null);
  };

  const toggleRegionSelection = (regionName) => {
    setSelectedDeskRegions(prev => 
      prev.includes(regionName) 
        ? prev.filter(r => r !== regionName)
        : [...prev, regionName]
    );
  };

  const toggleAllRegions = () => {
    if (selectedDeskRegions.length === regions.length) {
      setSelectedDeskRegions([]);
    } else {
      setSelectedDeskRegions(regions.map(r => r.name));
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      {/* REGISTRAR PENDING MEMBERS POPUP NOTICE */}
      {pendingMembersNoticeCount > 0 && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border-2 border-amber-500 animate-fade-in">
            <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center shrink-0 font-extrabold">
                <Users className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Pending JP Member Applications</h3>
                <p className="text-[11px] text-slate-500 font-bold">Registrar Portal Alert</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              There {pendingMembersNoticeCount === 1 ? 'is' : 'are'}{' '}
              <span className="font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                {pendingMembersNoticeCount} pending new JP Member {pendingMembersNoticeCount === 1 ? 'application' : 'applications'}
              </span>{' '}
              awaiting your review and approval.
            </p>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={handleDismissPendingNoticeAndGoToRegistrar}
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold rounded-lg text-xs uppercase tracking-wider shadow transition cursor-pointer flex items-center justify-center space-x-1"
              >
                <span>Ok</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {statsSuccessToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-500 flex items-center space-x-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-bold text-xs">Service Desk statistics updated successfully!</span>
        </div>
      )}

      {/* --- BRANDING HEADER --- */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white relative overflow-hidden border-b-4 border-amber-500">
        <div className="max-w-7xl mx-auto px-4 py-6 relative z-10 flex flex-wrap justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-amber-500 rounded-full flex items-center justify-center text-slate-950 font-extrabold text-xl shadow-lg border-2 border-white">
              JP
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Auckland Justices of the Peace</h1>
              <p className="text-xs text-sky-200 uppercase tracking-widest font-semibold">Service Desk Management Platform</p>
            </div>
          </div>

          {isAuthenticated && currentUser && (
            <div className="flex items-center space-x-3 mt-4 sm:mt-0 bg-slate-900/80 backdrop-blur p-3 rounded-lg border border-slate-700">
              <div className="text-right">
                <div className="font-bold flex items-center justify-end space-x-1">
                  <span>{currentUser.fullName}</span>
                  {currentUser.isProvisional && (
                    <span className="bg-amber-400 text-slate-950 text-[10px] px-1.5 py-0.5 rounded font-bold">Provisional</span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{currentUser.warrantNumber} • <span className="text-amber-400 font-semibold">{currentUser.role}</span></div>
              </div>
              <button 
                onClick={handleSignOut}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white cursor-pointer" 
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

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
          resetScreenOpen ? (
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
                  <input 
                    type="password" 
                    required 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Confirm New Password</label>
                  <input 
                    type="password" 
                    required 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                    placeholder="Re-enter new password"
                  />
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
                        <li>Fill in your full legal name, warrant number (e.g. <code className="bg-white px-1 border rounded">JP-25138</code>), mobile phone, and active email address.</li>
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
                      Welcome to the beta test roster management hub for Justices of the Peace across Auckland. Sign in to manage your duty shifts, view 12-week rolling service desk calendars, export device schedules, and log desk statistics.
                    </p>

                    <div className="pt-2 grid grid-cols-2 gap-4 text-xs font-bold text-slate-700">
                      <div className="flex items-center space-x-2 bg-white p-3 rounded-xl border border-slate-200">
                        <Calendar className="w-5 h-5 text-amber-600 shrink-0" />
                        <span>12-Week Rolling Calendar</span>
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

                    <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input 
                            type="email" 
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
                        onClick={() => setSignUpModalOpen(true)}
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
            {/* NAVIGATION TABS WITH HELP TAB */}
            <div className="bg-white rounded-xl shadow-sm p-2 border border-slate-200 mb-6 flex flex-wrap gap-2">
              <button onClick={() => setActiveTab('calendar')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition cursor-pointer ${activeTab === 'calendar' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Calendar className="w-4 h-4" />
                <span>Calendar (12 Wks)</span>
              </button>

              <button onClick={() => setActiveTab('my-shifts')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition cursor-pointer ${activeTab === 'my-shifts' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                <UserCheck className="w-4 h-4" />
                <span>My Shifts</span>
              </button>

              <button onClick={() => setActiveTab('statistics')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition cursor-pointer ${activeTab === 'statistics' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                <BarChart2 className="w-4 h-4" />
                <span>Statistics</span>
              </button>

              <button onClick={() => setActiveTab('service-desks')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition cursor-pointer ${activeTab === 'service-desks' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                <MapPin className="w-4 h-4" />
                <span>Service Desks</span>
              </button>

              <button onClick={() => setActiveTab('my-profile')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition cursor-pointer ${activeTab === 'my-profile' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Users className="w-4 h-4" />
                <span>My Profile</span>
              </button>

              {canViewActivityAudit && (
                <button onClick={() => setActiveTab('activity-audit')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition cursor-pointer ${activeTab === 'activity-audit' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <FileText className="w-4 h-4" />
                  <span>Activity Log</span>
                </button>
              )}

              {currentUser.role === 'Registrar' && (
                <button onClick={() => setActiveTab('registrar')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition cursor-pointer ${activeTab === 'registrar' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <Award className="w-4 h-4" />
                  <span>Registrar Portal</span>
                </button>
              )}

              <button onClick={() => setActiveTab('help')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition cursor-pointer ${activeTab === 'help' ? 'bg-amber-500 text-slate-950 shadow' : 'bg-slate-900 text-amber-400 hover:bg-slate-800'}`}>
                <HelpCircle className="w-4 h-4" />
                <span>Help</span>
              </button>
            </div>

            {/* TAB 1: CALENDAR VIEW */}
            {activeTab === 'calendar' && (
              <div className="space-y-6">
                <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">12-Week Rolling Calendar</h2>
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
                  {rolling12Weeks.map(week => (
                    <div key={week.weekNumber} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-2 bg-slate-900 text-white px-3 py-2 rounded-lg">
                        <span className="font-extrabold text-amber-400 text-sm uppercase tracking-wide">
                          Week {week.weekNumber} of 12
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
                                              disabled={shiftFinished}
                                              className={`w-full py-1 px-2 rounded font-black text-[10px] uppercase shadow-sm transition flex items-center justify-center space-x-1 ${shiftFinished ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'}`}
                                              title={shiftFinished ? 'This shift has finished and can no longer be withdrawn from' : 'Withdraw from this shift'}
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
                        <button onClick={() => setDeskViewFilter('Active')} className={`px-3 py-1.5 rounded-md cursor-pointer ${deskViewFilter === 'Active' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                          Active Desks ({activeDesksList.length})
                        </button>
                        <button onClick={() => setDeskViewFilter('Archived')} className={`px-3 py-1.5 rounded-md cursor-pointer ${deskViewFilter === 'Archived' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                          Archived Desks ({archivedDesksList.length})
                        </button>
                      </div>

                      {canManage && (
                        <button type="button" onClick={() => setCreateDeskModalOpen(true)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold shadow flex items-center space-x-1 cursor-pointer">
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

                          const primaryAdmin = userMap[desk.primaryAdminId];
                          const secondaryAdmin = userMap[desk.secondaryAdminId];

                          const deskSlotTemplates = slotTemplates.filter(s => s.deskId === desk.id);

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
                                        <option value="">-- Select Primary Desk Admin --</option>
                                        {eligibleAdminsList.map(u => (
                                          <option key={u.id} value={u.id}>{u.fullName} ({u.role} - {u.warrantNumber})</option>
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
                                        <option value="">-- Select Secondary Desk Admin --</option>
                                        {eligibleAdminsList
                                          .filter(u => u.id !== editDeskForm.primaryAdminId)
                                          .map(u => (
                                            <option key={u.id} value={u.id}>{u.fullName} ({u.role} - {u.warrantNumber})</option>
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
                                      {canManage && desk.status === 'Active' && (
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
                                      <span className="text-[10px] text-slate-400 font-bold">Click tile to maintain slot</span>
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
                                              onClick={() => handleOpenEditSlotModal(slot)}
                                              className={`p-2.5 rounded-lg border text-xs cursor-pointer shadow-sm transition space-y-1.5 ${
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
                      <option value="DEFAULT_5WEEKS">Prior Week + Calendar Wks 1-4 (Default)</option>
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
                            <button onClick={(e) => handleOpenWithdrawModal(occ, e)} disabled={shiftFinished} title={shiftFinished ? 'This shift has finished and can no longer be withdrawn from' : 'Withdraw from this shift'} className={`px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 shadow-xs ${shiftFinished ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'}`}>
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
                  <p className="text-xs text-slate-500">Keep your contact details current. Your role and warrant information are maintained by an AJPA Registrar.</p>
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
                      <label className="block font-bold text-slate-600 mb-1">Warrant number</label>
                      <input value={currentUser.warrantNumber || ''} readOnly className="w-full border border-slate-200 rounded-lg p-2.5 font-bold text-slate-600 bg-slate-100 cursor-not-allowed" />
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
                        Managed desks: {serviceDesks.filter(desk => desk.primaryAdminId === currentUser.id || desk.secondaryAdminId === currentUser.id).map(desk => `[${desk.code}] ${desk.name}`).join(', ') || 'No Primary or Secondary desk assignments are currently recorded.'}
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

                    <button 
                      onClick={handleDownloadCsv}
                      className="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-black shadow flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Filtered CSV</span>
                    </button>
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
                        <option value="CURRENT_AND_PREVIOUS">Current & Previous Month (Default)</option>
                        <option value="CURRENT_MONTH">Current Month Only</option>
                        <option value="LAST_MONTH">Last Month Only</option>
                        <option value="LAST_30_DAYS">Last 30 Days</option>
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

            {/* AUDIT LOG: restricted in both the interface and Supabase RLS. */}
            {activeTab === 'activity-audit' && canViewActivityAudit && (
              <div className="space-y-6">
                <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-slate-200 space-y-2">
                  <span className="bg-sky-100 text-sky-900 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Desk Admin & Registrar access</span>
                  <h2 className="text-xl font-extrabold text-slate-900">Roster Activity Log</h2>
                  <p className="text-xs text-slate-500">The latest 250 registration, withdrawal, and recurring-rule changes. Entries are recorded by the database and cannot be edited in the portal.</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
                  {rosterActivityAuditError ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-lg text-xs font-bold">
                      The activity log is not available yet. Run the Activity Audit Log SQL migration, then sign out and back in. Detail: {rosterActivityAuditError}
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
                            const actionLabel = activity.eventType === 'DUTY_REGISTERED'
                              ? 'Registered for shift'
                              : activity.eventType === 'DUTY_WITHDRAWN'
                                ? 'Withdrew from shift'
                                : activity.eventType === 'RULE_CREATED'
                                  ? `${activity.ruleAction === 'WITHDRAW' ? 'Withdrawal' : 'Registration'} rule created`
                                  : `${activity.ruleAction === 'WITHDRAW' ? 'Withdrawal' : 'Registration'} rule removed`;
                            const ruleDetail = activity.ruleType
                              ? `${activity.ruleType.replaceAll('_', ' ').toLowerCase()}${activity.ruleCount ? ` · ${activity.ruleCount} slot${activity.ruleCount === 1 ? '' : 's'}` : ''}`
                              : 'Single shift';
                            const occurredAt = activity.occurredAt
                              ? new Date(activity.occurredAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' })
                              : '—';

                            return (
                              <tr key={activity.id} className="hover:bg-sky-50/60">
                                <td className="p-2.5 whitespace-nowrap font-mono text-[11px] text-slate-700">{occurredAt}</td>
                                <td className="p-2.5 font-bold text-slate-900">{actor?.fullName || 'System / unknown account'}</td>
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
                      onClick={() => setConfirmDownloadModalOpen(true)}
                      className="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-extrabold shadow flex items-center space-x-1.5 transition cursor-pointer"
                      title="Export all application datasets into timestamped CSV files"
                    >
                      <Database className="w-4 h-4 text-emerald-300" />
                      <span>Download Data (CSV Archive)</span>
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
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">Association Members & Sign-up Queue</h3>
                        <p className="text-xs text-slate-500">Approve pending applications or maintain active profiles. Pending members appear at the top, followed by members sorted by surname, first name, and JP number.</p>
                      </div>
                      <button onClick={handleOpenAddUserModal} className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-lg text-xs font-bold shadow flex items-center space-x-1 cursor-pointer">
                        <UserPlus className="w-4 h-4" />
                        <span>Add New JP Member</span>
                      </button>
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
                          {sortedUsersForRegistrar.map(u => (
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
                                ) : (
                                  <>
                                    <button onClick={() => handleOpenEditUserModal(u)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer" title="Edit JP Details">
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => setPendingDeleteUserId(u.id)} className="p-1.5 bg-rose-50 hover:bg-rose-100 rounded text-rose-700 cursor-pointer" title="Delete JP Member">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
                        <li><b>My Profile:</b> update your email address and mobile phone. Your name, warrant number, role, and account status are displayed for reference and are maintained by a Registrar.</li>
                      </ul>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h4 className="font-extrabold text-xs text-slate-900 flex items-center space-x-2">
                        <Filter className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>2. Navigation & Calendar Filters</span>
                      </h4>
                      <ul className="list-disc pl-5 space-y-1 font-medium leading-relaxed">
                        <li><b>Calendar (12 Wks):</b> Displays recurring shift slots for a 12-week rolling window automatically rolling over after midnight Sunday night.</li>
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
                        <li>Open <b>Calendar (12 Wks) &rarr; Location &amp; desks</b> to choose which of your followed desks are currently displayed.</li>
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
                          <b>Automatic Calendar Rollover Logic:</b> When the 12-week calendar rolls over at midnight Sunday night, cases configured with <i>Next n slots</i>, <i>Slots until and including dd/mm/yyyy</i>, and <i>All future slots</i> will automatically register or withdraw you for the newly rolled-in slots according to your rule logic.
                        </li>
                        <li>
                          <b>My Shifts:</b> Use the <b>Date</b> and <b>Desk</b> filters to review your registered shifts across past, current, or future timeframes. <b>Log Stats</b> becomes available only after the shift has finished. At that point, calendar download and withdrawal are unavailable. Once statistics are logged, the disabled <b>Stats Logged</b> button directs you to the <b>Statistics</b> tab for any maintenance.
                        </li>
                        <li><b>Closed slots:</b> Grey slots marked <b>Desk closed</b> or <b>Statutory holiday</b> cannot be registered for.</li>
                        <li>When a registration is confirmed, you will receive an email with a calendar appointment attachment. You can also click <b>"Add to Cal"</b> on any registered shift to download an <code className="bg-white px-1 border rounded">.ics</code> calendar file for Outlook, Google, or Apple Calendar.</li>
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
                          <li>Click the edit icon next to any member to update warrant numbers, system roles (Member, Admin, Registrar), or provisional status.</li>
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
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* --- SHIFT REGISTRATION OPTIONS MODAL --- */}
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

      {/* --- MY SHIFTS CUSTOM DATE RANGE MODAL WINDOW --- */}
      {myShiftsCustomModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Interrogate My Shifts (Custom Date Range)</h3>
              <button onClick={() => setMyShiftsCustomModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">From Date</label>
                <input 
                  type="date" 
                  value={myShiftsCustomFrom} 
                  onChange={(e) => setMyShiftsCustomFrom(e.target.value)} 
                  className="w-full border rounded p-2 font-bold bg-white" 
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">To Date</label>
                <input 
                  type="date" 
                  value={myShiftsCustomTo} 
                  onChange={(e) => setMyShiftsCustomTo(e.target.value)} 
                  className="w-full border rounded p-2 font-bold bg-white" 
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button onClick={() => setMyShiftsCustomModalOpen(false)} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-amber-400 cursor-pointer">
                Apply Custom Range
              </button>
            </div>
          </div>
        </div>
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

      {/* --- CONFIRMATION DIALOG FOR SLOT MAINTENANCE BUTTON ACTIONS --- */}
      {slotActionConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center space-x-2 text-slate-900">
              <AlertTriangle className={`w-6 h-6 shrink-0 ${slotActionConfirm === 'DELETE' ? 'text-rose-600' : 'text-amber-500'}`} />
              <h3 className="text-lg font-black">
                {slotActionConfirm === 'SAVE' && 'Confirm Save Changes'}
                {slotActionConfirm === 'CANCEL' && 'Confirm Cancel Editing'}
                {slotActionConfirm === 'DELETE' && 'Confirm Slot Deletion'}
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {slotActionConfirm === 'SAVE' && 'Are you sure you want to save changes to this shift slot template? This will update all future occurrences on the 12-week calendar.'}
              {slotActionConfirm === 'CANCEL' && 'Are you sure you want to cancel? Any unsaved edits will be discarded.'}
              {slotActionConfirm === 'DELETE' && 'Are you sure you want to permanently delete this shift slot template? Active calendar shifts generated from this slot will be removed.'}
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button 
                onClick={() => setSlotActionConfirm(null)} 
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Go Back
              </button>
              <button 
                onClick={handleConfirmSlotAction} 
                className={`px-4 py-2 rounded-lg text-xs font-black shadow cursor-pointer ${
                  slotActionConfirm === 'DELETE' ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-slate-900 hover:bg-slate-800 text-amber-400'
                }`}
              >
                {slotActionConfirm === 'SAVE' && 'Yes, Save Changes'}
                {slotActionConfirm === 'CANCEL' && 'Yes, Discard Changes'}
                {slotActionConfirm === 'DELETE' && 'Yes, Delete Slot'}
              </button>
            </div>
          </div>
        </div>
      )}

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

            <form onSubmit={handleSaveEditedStatSubmit} className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 font-semibold text-slate-700">
                <div className="text-slate-900 font-extrabold text-xs sm:text-sm">
                  {editingStatRecord.deskName} [{editingStatRecord.deskCode}]
                </div>
                <div className="flex flex-wrap justify-between text-[11px] text-slate-600">
                  <span>📅 {editingStatRecord.date}</span>
                  <span>⏰ {editingStatRecord.startTime} - {editingStatRecord.endTime}</span>
                </div>
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
                    <option value="">-- Select Primary Admin --</option>
                    {eligibleAdminsList.map(u => (
                      <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>
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
                    <option value="">-- Select Secondary Admin --</option>
                    {eligibleAdminsList
                      .filter(u => u.id !== newDeskForm.primaryAdminId)
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>
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

      {/* --- CONFIRMATION MODAL FOR DELETING SHIFT SLOT TEMPLATE --- */}
      {pendingDeleteSlotId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center space-x-2 text-rose-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-black">Confirm Shift Slot Deletion</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this shift slot template? This will remove its recurring shift occurrences from the 12-week calendar view.
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button onClick={() => setPendingDeleteSlotId(null)} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">
                Cancel
              </button>
              <button onClick={confirmDeleteSlot} className="px-4 py-2 rounded-lg text-xs font-black bg-rose-600 text-white hover:bg-rose-700 shadow cursor-pointer">
                Delete Shift Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL FOR DELETING STAT ENTRY --- */}
      {confirmDeleteStatId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center space-x-2 text-rose-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-black">Confirm Statistics Log Deletion</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete this statistics record? This action cannot be undone and will update the master association logs immediately.
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button 
                onClick={() => setConfirmDeleteStatId(null)} 
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                No / Keep Record
              </button>
              <button 
                onClick={confirmDeleteStatRecord} 
                className="px-4 py-2 rounded-lg text-xs font-black bg-rose-600 text-white hover:bg-rose-700 shadow cursor-pointer"
              >
                Yes / Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CUSTOM DATE RANGE MODAL WINDOW --- */}
      {customDateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Select Custom Date Range</h3>
              <button onClick={() => setCustomDateModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">From Date</label>
                <input 
                  type="date" 
                  value={customFromDate} 
                  onChange={(e) => setCustomFromDate(e.target.value)} 
                  className="w-full border rounded p-2 font-bold bg-white" 
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">To Date</label>
                <input 
                  type="date" 
                  value={customToDate} 
                  onChange={(e) => setCustomToDate(e.target.value)} 
                  className="w-full border rounded p-2 font-bold bg-white" 
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button onClick={() => setCustomDateModalOpen(false)} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-amber-400 cursor-pointer">
                Apply Date Range
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- LOG STATS MODAL WINDOW FOR JP DUTY SHIFTS --- */}
      {logStatsOccurrence && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-slate-200 my-auto max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Shift Completion Log</span>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">Log Shift Service Statistics</h3>
              </div>
              <button onClick={() => setLogStatsOccurrence(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStatsSubmit} className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 font-semibold text-slate-700">
                <div className="text-slate-900 font-extrabold text-xs sm:text-sm">
                  {activeDeskMap[logStatsOccurrence.deskId]?.name} [{activeDeskMap[logStatsOccurrence.deskId]?.code}]
                </div>
                <div className="flex flex-wrap justify-between text-[11px] text-slate-600">
                  <span>📅 {logStatsOccurrence.formattedDate}</span>
                  <span>⏰ {logStatsOccurrence.startTime} - {logStatsOccurrence.endTime}</span>
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
                  <input type="text" required value={userForm.warrantNumber} onChange={(e) => setUserForm(prev => ({ ...prev, warrantNumber: e.target.value }))} className="w-full border rounded p-2 font-mono" />
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
                  <select value={userForm.status} onChange={(e) => setUserForm(prev => ({ ...prev, status: e.target.value }))} className="w-full border rounded p-2 font-bold">
                    <option value="Approved">Approved</option>
                    <option value="Pending">Pending</option>
                    <option value="Rejected">Rejected</option>
                  </select>
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

      {/* --- CONFIRMATION MODAL FOR DELETING USER --- */}
      {pendingDeleteUserId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center space-x-2 text-rose-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-black">Confirm Member Deletion</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this JP member profile? Their registrations and logged data will be removed from future views.
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button onClick={() => setPendingDeleteUserId(null)} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">
                Cancel
              </button>
              <button onClick={confirmDeleteUser} className="px-4 py-2 rounded-lg text-xs font-black bg-rose-600 text-white hover:bg-rose-700 shadow cursor-pointer">
                Delete Member
              </button>
            </div>
          </div>
        </div>
      )}

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

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setRegionModalOpen(false)} className="px-4 py-2 rounded font-bold bg-slate-100 text-slate-700">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded font-bold bg-slate-900 text-amber-400">Save Region</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL FOR DELETING REGION --- */}
      {pendingDeleteRegionId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center space-x-2 text-rose-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-black">Confirm Region Deletion</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this master region?
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button onClick={() => setPendingDeleteRegionId(null)} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">
                Cancel
              </button>
              <button onClick={confirmDeleteRegion} className="px-4 py-2 rounded-lg text-xs font-black bg-rose-600 text-white hover:bg-rose-700 shadow cursor-pointer">
                Delete Region
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL FOR DELETING SERVICE DESK --- */}
      {pendingDeleteDeskId && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center space-x-2 text-rose-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-black">Confirm Service Desk Archival</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to archive this service desk location? It will be moved to the Archived Desks list and its shifts will be hidden from active calendar views.
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button onClick={() => setPendingDeleteDeskId(null)} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">
                Cancel
              </button>
              <button onClick={confirmDeleteDesk} className="px-4 py-2 rounded-lg text-xs font-black bg-rose-600 text-white hover:bg-rose-700 shadow cursor-pointer">
                Archive Desk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SIGN UP MODAL --- */}
      {signUpModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">JP Roster Sign-Up Request</h3>
                <p className="text-xs text-slate-500 mt-0.5">Register for access to the Auckland JP Service Desk Platform</p>
              </div>
              <button onClick={() => setSignUpModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {signUpSuccessMsg ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-xl text-xs font-bold space-y-2 text-center animate-fade-in">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-sm font-black text-emerald-950">Application Submitted!</p>
                <p className="font-normal text-slate-600 leading-relaxed">
                  Your registration details have been submitted. Status set to <b>PENDING</b> awaiting AJPA Registrar verification.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSignUpSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Legal Name</label>
                  <input 
                    type="text" 
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
                    <input 
                      type="text" 
                      required 
                      value={signUpForm.warrantNumber}
                      onChange={(e) => setSignUpForm(prev => ({ ...prev, warrantNumber: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono"
                      placeholder="e.g. JP-12345"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Mobile Phone</label>
                    <input 
                      type="tel" 
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
                    onClick={() => setSignUpModalOpen(false)} 
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
                <p className="text-sm font-black text-sky-950">Reset Email Sent!</p>
                <p className="font-normal text-slate-600 leading-relaxed">
                  A password-reset link has been sent to <b>{resetEmail}</b>. Open that link from your email to choose a new password.
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
    </div>
  );
}
