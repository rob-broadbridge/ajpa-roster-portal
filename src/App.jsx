import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, MapPin, Users, UserCheck, ShieldAlert, 
  Plus, Search, Filter, Download, ChevronLeft, ChevronRight, 
  CheckCircle2, AlertTriangle, FileText, UserPlus, 
  LogOut, Phone, Mail, Award, Check, X, Lock, Key, ArrowLeft, Send,
  Edit2, Trash2, RotateCcw, Archive, Ban, CalendarPlus, Info,
  Globe, Shield, UserX, Building2, CheckSquare, Square, BarChart2, Clock, Settings, Database
} from 'lucide-react';

// --- MASTER REGIONS LIST ---
const INITIAL_REGIONS = [
  { id: 'reg-1', name: 'Auckland East', code: 'AKL-E' }
];

// --- INITIAL USERS ---
const INITIAL_USERS = [
  { id: 'usr-1', fullName: 'Rob Broadbridge (R)', email: 'rob@broadbridge.co.nz', password: 'Abc123', phone: '274909378', warrantNumber: 'JP-99999', role: 'Registrar', isProvisional: false, status: 'Approved' },
  { id: 'usr-2', fullName: 'Rob Broadbridge (A)', email: 'rob.broadbridge@gmail.com', password: 'Abc456', phone: '', warrantNumber: 'JP-88888', role: 'Admin', isProvisional: false, status: 'Approved' },
  { id: 'usr-3', fullName: 'Rob Broadbbridge (JP)', email: 'jp@broadbridge.co.nz', password: 'Abc789', phone: '', warrantNumber: 'JP-25138', role: 'Member', isProvisional: false, status: 'Approved' }
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
  'desk-newmarket_slot-nm-2_2026-09-05': ['usr-3']
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

export default function App() {
  // --- AUTH & GLOBAL STATE ---
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('calendar');

  const [users, setUsers] = useState(INITIAL_USERS);
  const [regions, setRegions] = useState(INITIAL_REGIONS);
  const [serviceDesks, setServiceDesks] = useState(INITIAL_SERVICE_DESKS);
  const [slotTemplates, setSlotTemplates] = useState(INITIAL_SLOT_TEMPLATES);
  const [followedDesks, setFollowedDesks] = useState(['desk-remuera', 'desk-glen-innes', 'desk-st-heliers', 'desk-panmure', 'desk-parnell', 'desk-newmarket', 'desk-otahuhu']);

  const [slotAssignments, setSlotAssignments] = useState(INITIAL_ASSIGNMENTS);
  const [cancelledSlotInstances, setCancelledSlotInstances] = useState([]);
  const [loggedStatistics, setLoggedStatistics] = useState(INITIAL_LOGGED_STATISTICS);

  // AUTH SCREEN MODALS & FORMS
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Register Modal State
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({ fullName: '', email: '', phone: '', warrantNumber: 'JP-', password: '', isProvisional: false });
  const [registerSuccessMsg, setRegisterSuccessMsg] = useState(false);

  // Forgot Password & Reset Modal State
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLinkSent, setResetLinkSent] = useState(false);

  const [resetScreenOpen, setResetScreenOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');

  // Simulated Email Alert Banner for Registrar
  const [emailAlert, setEmailAlert] = useState(null);

  // Desk & Calendar Filters
  const [deskViewFilter, setDeskViewFilter] = useState('Active');
  const [selectedDeskRegions, setSelectedDeskRegions] = useState(INITIAL_REGIONS.map(r => r.name));
  const [calendarDeskFilter, setCalendarDeskFilter] = useState('FOLLOWED');
  const [calendarRegionFilter, setCalendarRegionFilter] = useState('ALL');

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
  const [slotActionConfirm, setSlotActionConfirm] = useState(null); // 'SAVE' | 'CANCEL' | 'DELETE'

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

  useEffect(() => {
    if (currentUser?.role === 'Member') {
      setCalendarDeskFilter('FOLLOWED');
      setStatsJpFilter(currentUser.id);
    } else {
      setCalendarDeskFilter('ALL');
      setStatsJpFilter('ALL');
    }
  }, [currentUser]);

  const canManage = useMemo(() => {
    return currentUser?.role === 'Admin' || currentUser?.role === 'Registrar';
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

  const activeDeskMap = useMemo(() => {
    return serviceDesks.reduce((acc, desk) => {
      acc[desk.id] = desk;
      return acc;
    }, {});
  }, [serviceDesks]);

  const activeDesksList = useMemo(() => {
    return serviceDesks.filter(d => d.status === 'Active');
  }, [serviceDesks]);

  const archivedDesksList = useMemo(() => {
    return serviceDesks.filter(d => d.status === 'Archived');
  }, [serviceDesks]);

  // --- REGISTRAR: MASTER SYSTEM DATA CSV EXPORTER ENGINE ---
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

    // FILE 1: INITIAL_REGIONS
    const file1Headers = ['id', 'name', 'code'];
    triggerDownload(`${timestamp}_1.csv`, convertToCsv(regions, file1Headers));

    // FILE 2: INITIAL_USERS
    const file2Headers = ['id', 'fullName', 'email', 'password', 'phone', 'warrantNumber', 'role', 'isProvisional', 'status'];
    triggerDownload(`${timestamp}_2.csv`, convertToCsv(users, file2Headers));

    // FILE 3: INITIAL_SERVICE_DESKS
    const file3Headers = ['id', 'code', 'name', 'address', 'region', 'primaryAdminId', 'secondaryAdminId', 'siteContactName', 'siteContactEmail', 'contactPerson', 'notes', 'status'];
    triggerDownload(`${timestamp}_3.csv`, convertToCsv(serviceDesks, file3Headers));

    // FILE 4: INITIAL_SLOT_TEMPLATES
    const file4Headers = ['id', 'deskId', 'dayOfWeek', 'startTime', 'endTime', 'minJps', 'targetJps', 'maxJps', 'status', 'effectiveFromDate'];
    triggerDownload(`${timestamp}_4.csv`, convertToCsv(slotTemplates, file4Headers));

    // FILE 5: INITIAL_ASSIGNMENTS
    const assignmentsArray = Object.entries(slotAssignments).map(([instanceKey, assignedJpIds]) => ({
      instanceKey,
      assignedJpIds: JSON.stringify(assignedJpIds)
    }));
    triggerDownload(`${timestamp}_5.csv`, convertToCsv(assignmentsArray, ['instanceKey', 'assignedJpIds']));

    // FILE 6: INITIAL_LOGGED_STATISTICS
    const file6Headers = ['id', 'jpId', 'jpName', 'warrantNumber', 'deskId', 'deskName', 'deskCode', 'region', 'date', 'startTime', 'endTime', 'noOfJpDuties', 'noOfClients', 'noOfHoursWorked', 'certifiedCopies', 'statutoryDeclarations', 'signatureWitnessed', 'affidavits', 'other', 'notes'];
    triggerDownload(`${timestamp}_6.csv`, convertToCsv(loggedStatistics, file6Headers));
  };

  // --- AUTH HANDLERS ---
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setLoginError('');

    const foundUser = users.find(u => u.email.toLowerCase() === loginEmail.trim().toLowerCase());

    if (!foundUser) {
      setLoginError('No account found with this email address.');
      return;
    }

    if (foundUser.password !== loginPassword) {
      setLoginError('Invalid password. Please check your credentials and try again.');
      return;
    }

    if (foundUser.status === 'Pending') {
      setLoginError('Your registration is currently PENDING approval by an AJPA Registrar.');
      return;
    }

    if (foundUser.status === 'Rejected') {
      setLoginError('Your account application was not approved. Please contact the Registrar.');
      return;
    }

    setCurrentUser(foundUser);
    setIsAuthenticated(true);
    setLoginEmail('');
    setLoginPassword('');
  };

  const handleQuickDemoLogin = (role) => {
    const demoUser = users.find(u => u.role === role && u.status === 'Approved');
    if (demoUser) {
      setCurrentUser(demoUser);
      setIsAuthenticated(true);
      setLoginError('');
    }
  };

  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    
    if (users.some(u => u.email.toLowerCase() === registerForm.email.trim().toLowerCase())) {
      alert('An account with this email address already exists.');
      return;
    }

    const newUser = {
      id: `usr-${Date.now()}`,
      fullName: registerForm.fullName,
      email: registerForm.email.trim(),
      phone: registerForm.phone,
      warrantNumber: registerForm.warrantNumber,
      password: registerForm.password || 'password123',
      role: 'Member',
      isProvisional: registerForm.isProvisional,
      status: 'Pending'
    };

    setUsers(prev => [...prev, newUser]);
    setRegisterSuccessMsg(true);

    setEmailAlert({
      title: 'Automated Email Alert Sent to Registrars',
      message: `New JP Registration received for ${newUser.fullName} (${newUser.warrantNumber}). Status set to PENDING awaiting Registrar Portal approval.`
    });

    setTimeout(() => {
      setRegisterSuccessMsg(false);
      setRegisterModalOpen(false);
      setRegisterForm({ fullName: '', email: '', phone: '', warrantNumber: 'JP-', password: '', isProvisional: false });
    }, 2500);
  };

  const handleSendResetLink = (e) => {
    e.preventDefault();
    const found = users.find(u => u.email.toLowerCase() === resetEmail.trim().toLowerCase());
    if (!found) {
      alert('No registered JP account found with this email address.');
      return;
    }
    setResetLinkSent(true);
  };

  const handleSimulateOpenResetLink = () => {
    setForgotModalOpen(false);
    setResetLinkSent(false);
    setResetScreenOpen(true);
  };

  const handleSaveNewPassword = (e) => {
    e.preventDefault();
    setResetError('');

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match. Please re-enter.');
      return;
    }

    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters long.');
      return;
    }

    setUsers(prev => prev.map(u => u.email.toLowerCase() === resetEmail.trim().toLowerCase() ? { ...u, password: newPassword } : u));
    alert('Password updated successfully! You can now log in with your new password.');
    setResetScreenOpen(false);
    setNewPassword('');
    setConfirmPassword('');
    setResetEmail('');
  };

  const handleApprovePendingUser = (userId) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'Approved' } : u));
  };

  const handleRejectPendingUser = (userId) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'Rejected' } : u));
  };

  // --- CLIENT-SIDE DATA VALIDATION ENGINE FOR SLOT TEMPLATES ---
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
      return `Minimum JPs (${minJps}) cannot exceed Target JPs (${targetJps}). Rule: Min JPs \u2264 Target JPs \u2264 Max JPs.`;
    }

    if (targetJps > maxJps) {
      return `Target JPs (${targetJps}) cannot exceed Max JPs Capacity (${maxJps}). Rule: Min JPs \u2264 Target JPs \u2264 Max JPs.`;
    }

    return null;
  };

  const activeSlotValidationError = useMemo(() => {
    return validateSlotForm(slotForm);
  }, [slotForm]);

  // --- SLOT MANAGEMENT HANDLERS & CONFIRMATION ENGINE ---
  const handleOpenAddSlotModal = (targetDeskId = null) => {
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
    setSlotActionConfirm('DELETE');
  };

  const handleConfirmSlotAction = () => {
    if (slotActionConfirm === 'SAVE') {
      if (editingSlotId) {
        setSlotTemplates(prev => prev.map(s => s.id === editingSlotId ? { ...s, ...slotForm } : s));
      } else {
        const newSlot = {
          id: `slot-${Date.now()}`,
          ...slotForm
        };
        setSlotTemplates(prev => [...prev, newSlot]);
      }
      setSlotModalOpen(false);
    } else if (slotActionConfirm === 'CANCEL') {
      setSlotModalOpen(false);
    } else if (slotActionConfirm === 'DELETE') {
      if (editingSlotId) {
        setSlotTemplates(prev => prev.filter(s => s.id !== editingSlotId));
      }
      setSlotModalOpen(false);
    }
    setSlotActionConfirm(null);
    setSlotValidationError('');
  };

  const confirmDeleteSlot = () => {
    setSlotTemplates(prev => prev.filter(s => s.id !== pendingDeleteSlotId));
    setPendingDeleteSlotId(null);
  };

  // --- STATISTICS FILTERING ENGINE ---
  const filteredStatisticsList = useMemo(() => {
    if (!currentUser) return [];

    const today = new Date(2026, 8, 4); 
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

  // --- CSV DOWNLOAD EXPORTER ---
  const handleDownloadCsv = () => {
    if (filteredStatisticsList.length === 0) {
      alert('No statistics available to export for the selected filter range.');
      return;
    }

    const headers = [
      'Log ID', 'Date', 'Start Time', 'End Time', 'Region', 
      'Service Desk', 'Desk Code', 'JP Name', 'Warrant Number', 
      'JP Duties', 'Clients Served', 'Hours Worked', 
      'Certified Copies', 'Statutory Declarations', 'Signatures Witnessed', 
      'Affidavits', 'Other Duties', 'Notes'
    ];

    const rows = filteredStatisticsList.map(s => [
      `"${s.id}"`, `"${s.date}"`, `"${s.startTime}"`, `"${s.endTime}"`, `"${s.region}"`,
      `"${s.deskName}"`, `"${s.deskCode}"`, `"${s.jpName}"`, `"${s.warrantNumber}"`,
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

  // --- EDIT EXISTING STAT RECORD HANDLERS ---
  const handleOpenEditStatModal = (statRecord) => {
    setEditingStatRecord(statRecord);
    setEditStatForm({
      noOfJpDuties: statRecord.noOfJpDuties,
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
      setEditStatForm(prev => ({ ...prev, [field]: isNaN(val) || val < 0 ? 0 : val }));
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

  // --- SERVICE DESKS GROUPED BY REGION & ALPHABETIZED ---
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

  // --- AUTOMATIC 12-WEEK ROLLING CALENDAR ENGINE ---
  const rolling12Weeks = useMemo(() => {
    const weeks = [];
    const dayNameMap = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 0: 'Sunday' };
    const baseMonday = new Date(2026, 7, 31); 

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
  }, []);

  const generatedOccurrences = useMemo(() => {
    const instances = [];

    rolling12Weeks.forEach(week => {
      week.days.forEach(day => {
        slotTemplates.forEach(template => {
          const parentDesk = activeDeskMap[template.deskId];
          if (!parentDesk || parentDesk.status !== 'Active') return;

          if (template.status === 'Active' && template.dayOfWeek === day.fullDayName) {
            const instanceKey = `${template.deskId}_${template.id}_${day.isoDate}`;

            if (!cancelledSlotInstances.includes(instanceKey)) {
              const assignedJpIds = slotAssignments[instanceKey] || [];

              instances.push({
                instanceKey,
                slotId: template.id,
                deskId: template.deskId,
                date: day.isoDate,
                formattedDate: day.formattedDate,
                dayName: day.dayName,
                fullDayName: day.fullDayName,
                startTime: template.startTime,
                endTime: template.endTime,
                minJps: template.minJps,
                targetJps: template.targetJps,
                maxJps: template.maxJps,
                assignedJpIds
              });
            }
          }
        });
      });
    });

    return instances;
  }, [rolling12Weeks, slotTemplates, cancelledSlotInstances, slotAssignments, activeDeskMap]);

  // --- LOG STATS MODAL HANDLERS ---
  const handleOpenLogStatsModal = (occ, e) => {
    if (e) e.stopPropagation();
    setLogStatsOccurrence(occ);

    let defaultHours = 2.00;
    try {
      const [startH, startM] = occ.startTime.split(':').map(Number);
      const [endH, endM] = occ.endTime.split(':').map(Number);
      const diff = (endH * 60 + endM) - (startH * 60 + startM);
      if (diff > 0) defaultHours = parseFloat((diff / 60).toFixed(2));
    } catch (err) {}

    setStatsForm({
      noOfJpDuties: 1,
      noOfClients: 5,
      noOfHoursWorked: defaultHours,
      certifiedCopies: 8,
      statutoryDeclarations: 3,
      signatureWitnessed: 2,
      affidavits: 1,
      other: 0,
      notes: ''
    });
  };

  const handleStatsInputChange = (field, value, isFloat = false) => {
    if (isFloat) {
      const val = parseFloat(value);
      setStatsForm(prev => ({ ...prev, [field]: isNaN(val) || val < 0 ? 0 : val }));
    } else {
      const val = parseInt(value, 10);
      setStatsForm(prev => ({ ...prev, [field]: isNaN(val) || val < 0 ? 0 : val }));
    }
  };

  const handleSaveStatsSubmit = (e) => {
    e.preventDefault();
    if (!logStatsOccurrence || !currentUser) return;

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

    setLoggedStatistics(prev => [newStatEntry, ...prev]);
    setLogStatsOccurrence(null);
    setStatsSuccessToast(true);
    setTimeout(() => setStatsSuccessToast(false), 4000);
  };

  // --- REGISTRATION & CALENDAR EXPORT ---
  const handleDirectRegister = (occurrence, e) => {
    if (e) e.stopPropagation();

    const assignedCount = occurrence.assignedJpIds.length;
    const isAlreadyRegistered = occurrence.assignedJpIds.includes(currentUser.id);

    if (isAlreadyRegistered) {
      setSlotAssignments(prev => {
        const current = prev[occurrence.instanceKey] || [];
        return {
          ...prev,
          [occurrence.instanceKey]: current.filter(id => id !== currentUser.id)
        };
      });
      return;
    }

    if (assignedCount >= occurrence.maxJps) {
      alert(`The maximum capacity of ${occurrence.maxJps} JPs for this shift has been reached.`);
      return;
    }

    setSlotAssignments(prev => {
      const current = prev[occurrence.instanceKey] || [];
      return {
        ...prev,
        [occurrence.instanceKey]: [...current, currentUser.id]
      };
    });
  };

  const generateIcsFile = (occurrence, e) => {
    if (e) e.stopPropagation();
    const desk = activeDeskMap[occurrence.deskId] || {};
    
    const startTimeClean = occurrence.startTime.replace(':', '');
    const endTimeClean = occurrence.endTime.replace(':', '');
    const dateClean = occurrence.date.replace(/-/g, '');

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Auckland Justices of the Peace Association//Service Desk Platform//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
SUMMARY:JP Duty - ${desk.name || 'Service Desk'} [${desk.code || 'JP'}]
DESCRIPTION:Justice of the Peace Service Desk Duty at ${desk.name}.\\nAddress: ${desk.address || ''}\\nDuty Hours: ${occurrence.startTime} - ${occurrence.endTime}
LOCATION:${desk.address || 'Auckland, NZ'}
DTSTART:${dateClean}T${startTimeClean}00
DTEND:${dateClean}T${endTimeClean}00
STATUS:CONFIRMED
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `JP_Duty_${desk.code}_${occurrence.date}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- REGISTRAR: JP MEMBER HANDLERS ---
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

  const handleSaveUserSubmit = (e) => {
    e.preventDefault();
    if (editingUserId) {
      setUsers(prev => prev.map(u => u.id === editingUserId ? { ...u, ...userForm } : u));
    } else {
      const newUser = {
        id: `usr-${Date.now()}`,
        ...userForm
      };
      setUsers(prev => [...prev, newUser]);
    }
    setUserModalOpen(false);
  };

  const confirmDeleteUser = () => {
    setUsers(prev => prev.filter(u => u.id !== pendingDeleteUserId));
    setPendingDeleteUserId(null);
  };

  // --- REGISTRAR: MASTER REGION HANDLERS ---
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

  const handleSaveRegionSubmit = (e) => {
    e.preventDefault();
    if (editingRegionId) {
      const oldRegion = regions.find(r => r.id === editingRegionId);
      setRegions(prev => prev.map(r => r.id === editingRegionId ? { ...r, ...regionForm } : r));
      
      if (oldRegion && oldRegion.name !== regionForm.name) {
        setServiceDesks(prev => prev.map(d => d.region === oldRegion.name ? { ...d, region: regionForm.name } : d));
      }
    } else {
      const newReg = {
        id: `reg-${Date.now()}`,
        ...regionForm
      };
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

  // --- SERVICE DESK HANDLERS ---
  const handleCreateDeskSubmit = (e) => {
    e.preventDefault();

    if (newDeskForm.primaryAdminId && newDeskForm.primaryAdminId === newDeskForm.secondaryAdminId) {
      alert('Primary Admin and Secondary Admin cannot be the same person.');
      return;
    }

    const newDesk = {
      id: `desk-${Date.now()}`,
      code: (newDeskForm.code || 'JP').toUpperCase().substring(0, 2),
      name: newDeskForm.name,
      address: newDeskForm.address,
      region: newDeskForm.region || regions[0]?.name || 'Auckland East',
      primaryAdminId: newDeskForm.primaryAdminId || '',
      secondaryAdminId: newDeskForm.secondaryAdminId || '',
      siteContactName: newDeskForm.siteContactName || '',
      siteContactEmail: newDeskForm.siteContactEmail || '',
      contactPerson: newDeskForm.contactPerson || '',
      notes: newDeskForm.notes || '',
      status: 'Active'
    };
    setServiceDesks(prev => [...prev, newDesk]);
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

  const handleSaveDeskDirectly = (e) => {
    e.preventDefault();

    if (editDeskForm.primaryAdminId && editDeskForm.primaryAdminId === editDeskForm.secondaryAdminId) {
      alert('Primary Admin and Secondary Admin cannot be the same person.');
      return;
    }

    setServiceDesks(prev => prev.map(d => (d.id === editingDeskId ? { ...d, ...editDeskForm } : d)));
    setEditingDeskId(null);
  };

  const confirmDeleteDesk = () => {
    setServiceDesks(prev => prev.map(d => (d.id === pendingDeleteDeskId ? { ...d, status: 'Archived' } : d)));
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
      {/* EMAIL ALERT SIMULATOR BANNER FOR REGISTRARS */}
      {emailAlert && (
        <div className="bg-purple-900 text-white px-4 py-3 border-b-2 border-purple-400 flex justify-between items-center text-xs animate-fade-in">
          <div className="flex items-center space-x-2">
            <Mail className="w-4 h-4 text-purple-300 shrink-0" />
            <span className="font-bold">{emailAlert.title}:</span>
            <span className="text-purple-100">{emailAlert.message}</span>
          </div>
          <button onClick={() => setEmailAlert(null)} className="text-purple-300 hover:text-white font-bold p-1">
            <X className="w-4 h-4" />
          </button>
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
                onClick={() => {
                  setIsAuthenticated(false);
                  setCurrentUser(null);
                }} 
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white" 
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
        {!isAuthenticated ? (
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
                    placeholder="At least 6 characters"
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
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-lg font-bold text-sm shadow transition"
                >
                  Update Password & Return to Login
                </button>
              </form>
            </div>
          ) : (
            /* STANDARD LANDING / LOGIN SCREEN */
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-7 space-y-5">
                <span className="bg-amber-100 text-amber-900 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                  Official Association Portal
                </span>
                <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                  Auckland JP Service Desk Roster & Governance Platform
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Welcome to the official roster management hub for Justices of the Peace across Auckland. Sign in to manage your duty shifts, view 12-week rolling service desk calendars, export device schedules, and log desk statistics.
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

                {/* DEMO QUICK ACCESS ROLES */}
                <div className="bg-slate-200/70 p-4 rounded-xl border border-slate-300/80 space-y-2">
                  <span className="text-[11px] font-black uppercase text-slate-600 tracking-wider block">
                    Demo Fast Access (Click to test roles):
                  </span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button onClick={() => handleQuickDemoLogin('Registrar')} className="px-3 py-1.5 bg-purple-900 text-white rounded-lg font-bold hover:bg-purple-800 transition">
                      Login as Registrar
                    </button>
                    <button onClick={() => handleQuickDemoLogin('Admin')} className="px-3 py-1.5 bg-sky-800 text-white rounded-lg font-bold hover:bg-sky-700 transition">
                      Login as Desk Admin
                    </button>
                    <button onClick={() => handleQuickDemoLogin('Member')} className="px-3 py-1.5 bg-slate-900 text-amber-400 rounded-lg font-bold hover:bg-slate-800 transition">
                      Login as JP Member
                    </button>
                  </div>
                </div>
              </div>

              {/* LOGIN CARD */}
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
                        type="password" 
                        required 
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg pl-9 p-2.5 text-sm font-medium"
                        placeholder="••••••••"
                      />
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
                  <span className="text-xs text-slate-500 block">Not registered on the AJPA Roster yet?</span>
                  <button 
                    onClick={() => setRegisterModalOpen(true)}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs uppercase tracking-wider shadow transition cursor-pointer"
                  >
                    Click here to Register
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          /* --- AUTHENTICATED PORTAL VIEW --- */
          <>
            {/* NAVIGATION TABS WITH STATISTICS TAB */}
            <div className="bg-white rounded-xl shadow-sm p-2 border border-slate-200 mb-6 flex flex-wrap gap-2">
              <button onClick={() => setActiveTab('calendar')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${activeTab === 'calendar' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Calendar className="w-4 h-4" />
                <span>Calendar (12 Wks)</span>
              </button>

              <button onClick={() => setActiveTab('service-desks')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${activeTab === 'service-desks' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                <MapPin className="w-4 h-4" />
                <span>Service Desks</span>
              </button>

              <button onClick={() => setActiveTab('my-shifts')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${activeTab === 'my-shifts' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                <UserCheck className="w-4 h-4" />
                <span>My Shifts</span>
              </button>

              <button onClick={() => setActiveTab('statistics')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${activeTab === 'statistics' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                <BarChart2 className="w-4 h-4" />
                <span>Statistics</span>
              </button>

              {(currentUser.role === 'Registrar' || currentUser.role === 'Admin') && (
                <button onClick={() => setActiveTab('registrar')} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${activeTab === 'registrar' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <Award className="w-4 h-4" />
                  <span>Registrar Portal</span>
                </button>
              )}
            </div>

            {/* TAB 1: CALENDAR VIEW */}
            {activeTab === 'calendar' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">12-Week Rolling Calendar</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {currentUser.role === 'Member' ? 'Showing shift slots strictly for your Followed Service Desks.' : 'Filter calendar view by desk selection and master region.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {/* REGION FILTER */}
                    <div className="flex items-center space-x-1.5 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-300">
                      <Globe className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-bold text-slate-600">Region:</span>
                      <select 
                        value={calendarRegionFilter} 
                        onChange={(e) => setCalendarRegionFilter(e.target.value)}
                        className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
                      >
                        <option value="ALL">All Regions</option>
                        {regions.map(r => (
                          <option key={r.id} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* DESK FILTER */}
                    <div className="flex items-center space-x-1.5 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-300">
                      <Filter className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span className="font-bold text-slate-600">Desk:</span>
                      <select 
                        value={calendarDeskFilter} 
                        onChange={(e) => setCalendarDeskFilter(e.target.value)}
                        disabled={currentUser.role === 'Member'}
                        className={`bg-transparent font-bold text-slate-800 outline-none cursor-pointer ${currentUser.role === 'Member' ? 'opacity-80 cursor-not-allowed' : ''}`}
                      >
                        <option value="FOLLOWED">My Followed Desks Only</option>
                        <option value="ALL">All Service Desks</option>
                        {activeDesksList.map(desk => (
                          <option key={desk.id} value={desk.id}>[{desk.code}] {desk.name}</option>
                        ))}
                      </select>
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
                          const dayOccurrences = generatedOccurrences.filter(occ => {
                            const parentDesk = activeDeskMap[occ.deskId] || {};

                            if (calendarRegionFilter !== 'ALL' && parentDesk.region !== calendarRegionFilter) {
                              return false;
                            }

                            if (calendarDeskFilter === 'FOLLOWED' && !followedDesks.includes(occ.deskId)) return false;
                            if (calendarDeskFilter !== 'ALL' && calendarDeskFilter !== 'FOLLOWED' && occ.deskId !== calendarDeskFilter) return false;
                            
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

                                  let colorClass = 'bg-rose-50 border-rose-300 text-rose-900 hover:bg-rose-100';
                                  if (assigned >= occ.targetJps) colorClass = 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100';
                                  else if (assigned >= occ.minJps) colorClass = 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100';

                                  return (
                                    <div 
                                      key={occ.instanceKey} 
                                      onClick={() => setDetailedSlotModal(occ)} 
                                      className={`p-2 rounded-lg border text-xs cursor-pointer shadow-sm transition space-y-2 ${colorClass}`}
                                    >
                                      <div className="font-extrabold flex justify-between items-center">
                                        <span className="bg-slate-900 text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-black">{desk.code || 'JP'}</span>
                                        <span className="text-[10px] font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">{assigned}/{occ.targetJps} JPs</span>
                                      </div>

                                      <div className="font-bold truncate text-[11px] text-slate-900">{desk.name}</div>
                                      <div className="text-[10px] font-semibold text-slate-700 flex items-center space-x-1">
                                        <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                                        <span>{occ.startTime} - {occ.endTime}</span>
                                      </div>

                                      {/* ACTION BUTTONS CONTAINER */}
                                      <div className="pt-1.5 border-t border-slate-200/60 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                                        {isRegistered ? (
                                          <>
                                            <div className="grid grid-cols-2 gap-1">
                                              <button 
                                                type="button" 
                                                onClick={(e) => handleOpenLogStatsModal(occ, e)} 
                                                className="py-1 px-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded font-black text-[9px] uppercase shadow-xs flex items-center justify-center space-x-0.5 transition cursor-pointer"
                                                title="Log Shift Statistics"
                                              >
                                                <BarChart2 className="w-2.5 h-2.5 shrink-0" />
                                                <span>Log Stats</span>
                                              </button>

                                              <button 
                                                type="button" 
                                                onClick={(e) => generateIcsFile(occ, e)} 
                                                className="py-1 px-1 bg-sky-600 hover:bg-sky-500 text-white rounded font-black text-[9px] uppercase shadow-xs flex items-center justify-center space-x-0.5 transition cursor-pointer"
                                                title="Add to Device Calendar"
                                              >
                                                <CalendarPlus className="w-2.5 h-2.5 shrink-0" />
                                                <span>Add to Cal</span>
                                              </button>
                                            </div>

                                            <button 
                                              type="button" 
                                              onClick={(e) => handleDirectRegister(occ, e)} 
                                              className="w-full py-1 px-2 rounded font-black text-[10px] uppercase shadow-sm transition flex items-center justify-center space-x-1 bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                                            >
                                              <UserCheck className="w-3 h-3" />
                                              <span>Withdraw</span>
                                            </button>
                                          </>
                                        ) : (
                                          <button 
                                            type="button" 
                                            onClick={(e) => handleDirectRegister(occ, e)} 
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
                        <button onClick={() => setDeskViewFilter('Active')} className={`px-3 py-1.5 rounded-md ${deskViewFilter === 'Active' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                          Active Desks ({activeDesksList.length})
                        </button>
                        <button onClick={() => setDeskViewFilter('Archived')} className={`px-3 py-1.5 rounded-md ${deskViewFilter === 'Archived' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
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

                  {/* MULTI-REGION SELECTION BAR */}
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

                {/* GROUPED SERVICE DESKS */}
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

                                      <button onClick={() => setFollowedDesks(prev => isFollowed ? prev.filter(id => id !== desk.id) : [...prev, desk.id])} className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${isFollowed ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-50 text-slate-700 border-slate-300'}`}>
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
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                <h2 className="text-xl font-bold text-slate-900">My Registered Roster Shifts</h2>
                {generatedOccurrences.filter(o => o.assignedJpIds.includes(currentUser.id)).map(occ => {
                  const desk = activeDeskMap[occ.deskId] || {};
                  return (
                    <div key={occ.instanceKey} onClick={() => setDetailedSlotModal(occ)} className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap justify-between items-center gap-3 cursor-pointer hover:bg-slate-100 transition">
                      <div>
                        <h3 className="font-bold text-slate-900 flex items-center space-x-2">
                          <span className="bg-slate-900 text-amber-400 text-xs px-2 py-0.5 rounded font-black">{desk.code || 'JP'}</span>
                          <span>{desk.name}</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">{occ.formattedDate} • {occ.startTime} - {occ.endTime}</p>
                      </div>
                      <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                        <button onClick={(e) => handleOpenLogStatsModal(occ, e)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 cursor-pointer">
                          <BarChart2 className="w-3.5 h-3.5" />
                          <span>Log Stats</span>
                        </button>
                        <button onClick={(e) => generateIcsFile(occ, e)} className="bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1 cursor-pointer">
                          <CalendarPlus className="w-3.5 h-3.5" />
                          <span>Add to Cal</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
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

            {/* TAB 5: REGISTRAR GOVERNANCE PORTAL */}
            {activeTab === 'registrar' && (currentUser.role === 'Registrar' || currentUser.role === 'Admin') && (
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
                      title="Export all 6 application datasets into timestamped CSV files"
                    >
                      <Database className="w-4 h-4 text-emerald-300" />
                      <span>Download Data (CSV Archive)</span>
                    </button>

                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold">
                      <button onClick={() => setRegistrarSubTab('members')} className={`px-4 py-2 rounded-md flex items-center space-x-1.5 cursor-pointer ${registrarSubTab === 'members' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                        <Users className="w-3.5 h-3.5" />
                        <span>JP Members ({users.length})</span>
                      </button>
                      <button onClick={() => setRegistrarSubTab('slots')} className={`px-4 py-2 rounded-md flex items-center space-x-1.5 cursor-pointer ${registrarSubTab === 'slots' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                        <Settings className="w-3.5 h-3.5" />
                        <span>Manage Slots ({slotTemplates.length})</span>
                      </button>
                      <button onClick={() => setRegistrarSubTab('regions')} className={`px-4 py-2 rounded-md flex items-center space-x-1.5 cursor-pointer ${registrarSubTab === 'regions' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                        <Globe className="w-3.5 h-3.5" />
                        <span>Regions ({regions.length})</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* SUBTAB 1: JP MEMBERS */}
                {registrarSubTab === 'members' && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">Association Members & Registration Queue</h3>
                        <p className="text-xs text-slate-500">Approve pending applications or maintain active profiles.</p>
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
                          {users.map(u => (
                            <tr key={u.id} className={`hover:bg-slate-50 transition ${u.status === 'Pending' ? 'bg-amber-50/60' : ''}`}>
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
          </>
        )}
      </div>

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
                <p className="text-[11px] text-slate-500">6 System CSV Archives</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to download all existing application data? This will generate <b>6 timestamped CSV files</b> corresponding to all core datasets:
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] font-mono space-y-1 text-slate-700">
              <div className="flex justify-between"><span>1. INITIAL_REGIONS</span><span className="font-bold text-emerald-700">[Suffix _1.csv]</span></div>
              <div className="flex justify-between"><span>2. INITIAL_USERS</span><span className="font-bold text-emerald-700">[Suffix _2.csv]</span></div>
              <div className="flex justify-between"><span>3. INITIAL_SERVICE_DESKS</span><span className="font-bold text-emerald-700">[Suffix _3.csv]</span></div>
              <div className="flex justify-between"><span>4. INITIAL_SLOT_TEMPLATES</span><span className="font-bold text-emerald-700">[Suffix _4.csv]</span></div>
              <div className="flex justify-between"><span>5. INITIAL_ASSIGNMENTS</span><span className="font-bold text-emerald-700">[Suffix _5.csv]</span></div>
              <div className="flex justify-between"><span>6. INITIAL_LOGGED_STATISTICS</span><span className="font-bold text-emerald-700">[Suffix _6.csv]</span></div>
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
                {editingSlotId ? 'Edit Shift Slot Template' : 'Create New Shift Slot Template'}
              </h3>
              <button onClick={handlePromptCancelSlot} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {(slotValidationError || activeSlotValidationError) && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs font-bold flex items-start space-x-2 animate-pulse">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold uppercase tracking-wider block text-[10px] text-rose-900">Data Validation Warning</span>
                  <span>{slotValidationError || activeSlotValidationError}</span>
                </div>
              </div>
            )}

            <form onSubmit={handlePromptSaveSlot} className="space-y-3 text-xs">
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

              <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                {editingSlotId ? (
                  <button 
                    type="button" 
                    onClick={handlePromptDeleteSlot} 
                    className="px-4 py-2 rounded-lg font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Slot</span>
                  </button>
                ) : <div />}

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
                    required 
                    value={editStatForm.noOfJpDuties} 
                    onChange={(e) => handleEditStatInputChange('noOfJpDuties', e.target.value)} 
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-sm bg-white" 
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
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-base font-black text-slate-900">Select Custom Date Frame</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">From Date (Inclusive)</label>
                <input 
                  type="date" 
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">To Date (Inclusive)</label>
                <input 
                  type="date" 
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button 
                onClick={() => setCustomDateModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-amber-400 font-bold rounded text-xs"
              >
                Apply Custom Range
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- REGISTER NEW JP MEMBER POPUP MODAL --- */}
      {registerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Registration</span>
                <h3 className="text-lg font-black text-slate-900 mt-1">Register as a JP Member</h3>
              </div>
              <button onClick={() => setRegisterModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {registerSuccessMsg ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-xl text-xs space-y-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="font-extrabold text-sm">Registration Submitted!</h4>
                <p>Your details have been logged with status <b>PENDING</b>. An email notification has been dispatched to all Registrars to review and activate your account.</p>
              </div>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                  <input 
                    type="text" 
                    required 
                    value={registerForm.fullName}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, fullName: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                    placeholder="e.g. Margaret Smith"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Warrant Number</label>
                    <input 
                      type="text" 
                      required 
                      value={registerForm.warrantNumber}
                      onChange={(e) => setRegisterForm(prev => ({ ...prev, warrantNumber: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono font-bold"
                      placeholder="JP-XXXXX"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Mobile Phone</label>
                    <input 
                      type="text" 
                      required 
                      value={registerForm.phone}
                      onChange={(e) => setRegisterForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                      placeholder="021 000 0000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                  <input 
                    type="email" 
                    required 
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                    placeholder="e.g. margaret@ajpa.org.nz"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Create Password</label>
                  <input 
                    type="password" 
                    required 
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                    placeholder="Minimum 6 characters"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <label className="flex items-center space-x-2 font-bold text-slate-700 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={registerForm.isProvisional}
                      onChange={(e) => setRegisterForm(prev => ({ ...prev, isProvisional: e.target.checked }))}
                      className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                    />
                    <span>Check if you are a Provisional JP</span>
                  </label>
                </div>

                <p className="text-[10px] text-slate-400 italic">
                  Note: Upon submission, your registration is set to Pending until verified by an AJPA Registrar.
                </p>

                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <button 
                    type="button" 
                    onClick={() => setRegisterModalOpen(false)}
                    className="px-4 py-2 rounded-lg font-bold bg-slate-100 text-slate-700"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2 rounded-lg font-bold bg-slate-900 text-amber-400 hover:bg-slate-800 shadow cursor-pointer"
                  >
                    Submit Registration
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* --- FORGOT PASSWORD PROMPT MODAL --- */}
      {forgotModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="bg-sky-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Account Recovery</span>
                <h3 className="text-lg font-black text-slate-900 mt-1">Forgot Your Password?</h3>
              </div>
              <button onClick={() => setForgotModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetLinkSent ? (
              <div className="bg-sky-50 border border-sky-200 text-sky-900 p-4 rounded-xl text-xs space-y-3">
                <div className="flex items-center space-x-2 font-bold text-sm text-sky-950">
                  <Mail className="w-5 h-5 text-sky-600 shrink-0" />
                  <span>Password Reset Email Dispatched!</span>
                </div>
                <p>An email containing a secure password change link has been sent to <b>{resetEmail}</b>.</p>
                <div className="pt-2 border-t border-sky-200 flex justify-between items-center">
                  <span className="text-[10px] text-sky-700 italic">Demo shortcut: Click link below to open change screen</span>
                  <button 
                    onClick={handleSimulateOpenResetLink}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded text-[11px] cursor-pointer"
                  >
                    Open Reset Link &rarr;
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendResetLink} className="space-y-4 text-xs">
                <p className="text-slate-600">Enter your registered email address below. We will send you an email with instructions and a link to reset your password.</p>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Registered Email Address</label>
                  <input 
                    type="email" 
                    required 
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-medium"
                    placeholder="e.g. rob@broadbridge.co.nz"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <button 
                    type="button" 
                    onClick={() => setForgotModalOpen(false)}
                    className="px-4 py-2 rounded-lg font-bold bg-slate-100 text-slate-700"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2 rounded-lg font-bold bg-sky-600 text-white hover:bg-sky-700 shadow cursor-pointer flex items-center space-x-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Reset Email</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* --- SLOT DETAILS MODAL WINDOW --- */}
      {detailedSlotModal && currentUser && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-slate-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="bg-slate-900 text-amber-400 text-xs font-black px-2 py-0.5 rounded uppercase">
                  {activeDeskMap[detailedSlotModal.deskId]?.code || 'JP'}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">
                  {activeDeskMap[detailedSlotModal.deskId]?.name || 'Service Desk'}
                </h3>
                <p className="text-xs text-slate-500 flex items-center space-x-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>{activeDeskMap[detailedSlotModal.deskId]?.address}</span>
                </p>
              </div>
              <button onClick={() => setDetailedSlotModal(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Day & Date</span>
                <span className="text-slate-900 font-bold">{detailedSlotModal.fullDayName}, {detailedSlotModal.formattedDate}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Shift Time</span>
                <span className="text-slate-900 font-bold">{detailedSlotModal.startTime} - {detailedSlotModal.endTime}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Region</span>
                <span className="text-slate-900 font-bold">{activeDeskMap[detailedSlotModal.deskId]?.region}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Capacity Status</span>
                <span className="text-slate-900 font-bold">{detailedSlotModal.assignedJpIds.length} / {detailedSlotModal.targetJps} JPs Assigned</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider flex items-center justify-between">
                <span>Registered JP Members</span>
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono text-[10px]">
                  {detailedSlotModal.assignedJpIds.length} Person(s)
                </span>
              </h4>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-2 space-y-1.5 max-h-36 overflow-y-auto">
                {detailedSlotModal.assignedJpIds.length === 0 ? (
                  <div className="text-xs text-slate-400 italic py-2 text-center">No JPs registered for this shift yet</div>
                ) : (
                  detailedSlotModal.assignedJpIds.map(jpId => {
                    const member = userMap[jpId] || { fullName: 'Registered JP', warrantNumber: 'JP-MEMBER', email: 'jp@broadbridge.co.nz' };
                    return (
                      <div key={jpId} className="p-2 bg-white rounded-lg border border-slate-200 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold text-slate-900">{member.fullName}</div>
                          <div className="text-[10px] text-slate-500">{member.warrantNumber} • {member.email}</div>
                        </div>
                        {jpId === currentUser.id && (
                          <span className="bg-amber-100 text-amber-900 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">You</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
              {detailedSlotModal.assignedJpIds.includes(currentUser.id) ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      type="button" 
                      onClick={(e) => {
                        setDetailedSlotModal(null);
                        handleOpenLogStatsModal(detailedSlotModal, e);
                      }} 
                      className="py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-black text-xs uppercase shadow flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      <span>Log Stats</span>
                    </button>

                    <button 
                      type="button" 
                      onClick={(e) => generateIcsFile(detailedSlotModal, e)} 
                      className="py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-black text-xs uppercase shadow flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>Add to Cal</span>
                    </button>
                  </div>

                  <button 
                    type="button" 
                    onClick={(e) => {
                      handleDirectRegister(detailedSlotModal, e);
                      setDetailedSlotModal(null);
                    }} 
                    className="w-full py-2.5 rounded-lg font-black text-xs uppercase shadow transition flex items-center justify-center space-x-1 bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Withdraw From Shift</span>
                  </button>
                </>
              ) : (
                <button 
                  type="button" 
                  onClick={(e) => {
                    handleDirectRegister(detailedSlotModal, e);
                    setDetailedSlotModal(null);
                  }} 
                  className="w-full py-2.5 rounded-lg font-black text-xs uppercase shadow transition flex items-center justify-center space-x-1 bg-slate-900 hover:bg-slate-800 text-amber-400 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Register For Shift</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- LOG STATS MODAL WINDOW --- */}
      {logStatsOccurrence && currentUser && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-slate-200 my-auto max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Official Log</span>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">Log Service Desk Statistics</h3>
              </div>
              <button onClick={() => setLogStatsOccurrence(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStatsSubmit} className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 font-semibold text-slate-700">
                <div className="text-slate-900 font-extrabold text-xs sm:text-sm">
                  {activeDeskMap[logStatsOccurrence.deskId]?.name || 'Service Desk'}
                </div>
                <div className="flex flex-wrap justify-between text-[11px] text-slate-600">
                  <span>📅 {logStatsOccurrence.formattedDate}</span>
                  <span>⏰ {logStatsOccurrence.startTime} - {logStatsOccurrence.endTime}</span>
                </div>
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                  JP: <span className="font-bold text-slate-800">{currentUser.fullName}</span> ({currentUser.warrantNumber})
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <label className="block font-bold text-slate-700 mb-1">No. of JP Duties</label>
                  <input 
                    type="number" 
                    min="0"
                    step="1"
                    required 
                    value={statsForm.noOfJpDuties} 
                    onChange={(e) => handleStatsInputChange('noOfJpDuties', e.target.value)} 
                    className="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-sm bg-white" 
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

              <div className="flex justify-end space-x-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setLogStatsOccurrence(null)} 
                  className="px-4 py-2.5 rounded-lg font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 rounded-lg font-bold bg-slate-900 text-amber-400 hover:bg-slate-800 shadow-md cursor-pointer"
                >
                  Save Statistics Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD / EDIT JP USER MODAL --- */}
      {userModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">{editingUserId ? 'Maintain JP Member Profile' : 'Add New JP Member'}</h3>
            <form onSubmit={handleSaveUserSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                  <input type="text" required value={userForm.fullName} onChange={(e) => setUserForm(prev => ({ ...prev, fullName: e.target.value }))} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Warrant Number</label>
                  <input type="text" required value={userForm.warrantNumber} onChange={(e) => setUserForm(prev => ({ ...prev, warrantNumber: e.target.value }))} className="w-full border rounded p-2 font-mono font-bold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                  <input type="email" required value={userForm.email} onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                  <input type="text" value={userForm.phone} onChange={(e) => setUserForm(prev => ({ ...prev, phone: e.target.value }))} className="w-full border rounded p-2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">System Role</label>
                  <select value={userForm.role} onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value }))} className="w-full border rounded p-2 font-bold">
                    <option value="Member">JP Member</option>
                    <option value="Admin">Desk Admin</option>
                    <option value="Registrar">Registrar</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Provisional Status</label>
                  <select value={userForm.isProvisional ? 'YES' : 'NO'} onChange={(e) => setUserForm(prev => ({ ...prev, isProvisional: e.target.value === 'YES' }))} className="w-full border rounded p-2 font-bold">
                    <option value="NO">Fully Sworn</option>
                    <option value="YES">Provisional</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button type="button" onClick={() => setUserModalOpen(false)} className="px-4 py-2 rounded font-bold bg-slate-100 text-slate-700">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded font-bold bg-slate-900 text-amber-400">Save JP Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD / EDIT REGION MODAL --- */}
      {regionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">{editingRegionId ? 'Edit Master Region' : 'Add New Region'}</h3>
            <form onSubmit={handleSaveRegionSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Region Name</label>
                <input type="text" required value={regionForm.name} onChange={(e) => setRegionForm(prev => ({ ...prev, name: e.target.value }))} className="w-full border rounded p-2" placeholder="e.g. West Auckland" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Region Short Code</label>
                <input type="text" required value={regionForm.code} onChange={(e) => setRegionForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} className="w-full border rounded p-2 font-bold uppercase" placeholder="e.g. AKL-W" />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button type="button" onClick={() => setRegionModalOpen(false)} className="px-4 py-2 rounded font-bold bg-slate-100 text-slate-700">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded font-bold bg-slate-900 text-amber-400">Save Region</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODALS --- */}
      {pendingDeleteUserId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-rose-700">Confirm Deletion of JP Member</h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete this JP Member record? This action will remove their profile and access across all roster views.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button onClick={() => setPendingDeleteUserId(null)} className="px-4 py-2 rounded text-xs font-bold bg-slate-100 text-slate-700">No / Keep Member</button>
              <button onClick={confirmDeleteUser} className="px-4 py-2 rounded text-xs font-bold bg-rose-600 text-white">Yes / Delete Member</button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteRegionId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-rose-700">Confirm Master Region Deletion</h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete this region? Attached service desks will need to be rebound to another active region.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button onClick={() => setPendingDeleteRegionId(null)} className="px-4 py-2 rounded text-xs font-bold bg-slate-100 text-slate-700">No / Cancel</button>
              <button onClick={confirmDeleteRegion} className="px-4 py-2 rounded text-xs font-bold bg-rose-600 text-white">Yes / Delete Region</button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteDeskId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold text-rose-700">Confirm Service Desk Deletion</h3>
            <p className="text-xs text-slate-600">
              Do you wish to continue? Deleting <b>{activeDeskMap[pendingDeleteDeskId]?.name}</b> will archive the desk and immediately remove all its slots from active roster views.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button onClick={() => setPendingDeleteDeskId(null)} className="px-4 py-2 rounded text-xs font-bold bg-slate-100 text-slate-700">No / Cancel</button>
              <button onClick={confirmDeleteDesk} className="px-4 py-2 rounded text-xs font-bold bg-rose-600 text-white">Yes / Delete Desk</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}