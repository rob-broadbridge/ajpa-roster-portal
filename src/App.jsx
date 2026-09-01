import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, MapPin, Users, UserCheck, ShieldAlert, 
  Plus, Search, Filter, Download, ChevronLeft, ChevronRight, 
  CheckCircle2, AlertTriangle, FileText, UserPlus, 
  LogOut, Phone, Mail, Award, Check, X, Smartphone, Monitor,
  Edit2, Trash2, RotateCcw, Archive, Ban, CalendarPlus, Info,
  Globe, Shield, UserX, Building2, CheckSquare, Square, BarChart2, Clock
} from 'lucide-react';

// --- MASTER REGIONS LIST ---
const INITIAL_REGIONS = [
  { id: 'reg-1', name: 'Central Auckland', code: 'AKL-C' },
  { id: 'reg-2', name: 'Central East Auckland', code: 'AKL-CE' },
  { id: 'reg-3', name: 'East Auckland', code: 'AKL-E' },
  { id: 'reg-4', name: 'South Auckland', code: 'AKL-S' },
  { id: 'reg-5', name: 'North Shore', code: 'AKL-N' },
  { id: 'reg-6', name: 'West Auckland', code: 'AKL-W' }
];

// --- INITIAL SERVICE DESKS ---
const INITIAL_SERVICE_DESKS = [
  {
    id: 'desk-remuera',
    code: 'RM',
    name: 'Remuera Library Service Desk',
    address: '429 Remuera Road, Remuera, Auckland 1050',
    region: 'Central East Auckland',
    contactPerson: 'Library Duty Desk',
    notes: 'Located in the quiet study zone on Level 1.',
    status: 'Active'
  },
  {
    id: 'desk-parnell',
    code: 'PL',
    name: 'Parnell Library Service Desk',
    address: '545 Parnell Road, Parnell, Auckland 1052',
    region: 'Central Auckland',
    contactPerson: 'Floor Supervisor',
    notes: 'Located near the community hub entrance.',
    status: 'Active'
  },
  {
    id: 'desk-glen-innes',
    code: 'GI',
    name: 'Glen Innes Community Centre',
    address: '98 Line Road, Glen Innes, Auckland 1072',
    region: 'East Auckland',
    contactPerson: 'Centre Coordinator',
    notes: 'Main hall desk. High document volume on Saturdays.',
    status: 'Active'
  },
  {
    id: 'desk-newmarket',
    code: 'NM',
    name: 'Newmarket Library Service Desk',
    address: '33 Remuera Road, Newmarket, Auckland 1050',
    region: 'Central Auckland',
    contactPerson: 'Library Duty Officer',
    notes: 'Ground level behind main information desk.',
    status: 'Active'
  },
  {
    id: 'desk-otahuhu',
    code: 'OH',
    name: 'Otahuhu Community Hub',
    address: '28 Toia Terrace, Otahuhu, Auckland 1062',
    region: 'South Auckland',
    contactPerson: 'Facility Coordinator',
    notes: 'Main foyer desk near community room 2.',
    status: 'Active'
  }
];

const INITIAL_SLOT_TEMPLATES = [
  { id: 'slot-rm-1', deskId: 'desk-remuera', dayOfWeek: 'Tuesday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 2, maxJps: 2, status: 'Active', effectiveFromDate: '2026-01-01' },
  { id: 'slot-rm-2', deskId: 'desk-remuera', dayOfWeek: 'Friday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 2, maxJps: 2, status: 'Active', effectiveFromDate: '2026-01-01' },
  { id: 'slot-pl-1', deskId: 'desk-parnell', dayOfWeek: 'Wednesday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 2, maxJps: 2, status: 'Active', effectiveFromDate: '2026-01-01' },
  { id: 'slot-pl-2', deskId: 'desk-parnell', dayOfWeek: 'Saturday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 2, maxJps: 3, status: 'Active', effectiveFromDate: '2026-01-01' },
  { id: 'slot-gi-1', deskId: 'desk-glen-innes', dayOfWeek: 'Tuesday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 2, maxJps: 2, status: 'Active', effectiveFromDate: '2026-01-01' },
  { id: 'slot-gi-2', deskId: 'desk-glen-innes', dayOfWeek: 'Saturday', startTime: '09:30', endTime: '11:30', minJps: 1, targetJps: 2, maxJps: 3, status: 'Active', effectiveFromDate: '2026-01-01' },
  { id: 'slot-nm-1', deskId: 'desk-newmarket', dayOfWeek: 'Wednesday', startTime: '12:00', endTime: '14:00', minJps: 1, targetJps: 2, maxJps: 2, status: 'Active', effectiveFromDate: '2026-01-01' },
  { id: 'slot-nm-2', deskId: 'desk-newmarket', dayOfWeek: 'Saturday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 2, maxJps: 2, status: 'Active', effectiveFromDate: '2026-01-01' },
  { id: 'slot-oh-1', deskId: 'desk-otahuhu', dayOfWeek: 'Thursday', startTime: '10:00', endTime: '12:00', minJps: 1, targetJps: 2, maxJps: 2, status: 'Active', effectiveFromDate: '2026-01-01' }
];

const INITIAL_USERS = [
  { id: 'usr-1', fullName: 'Robert Broadbridge', email: 'robert@ajpa.org.nz', phone: '021 123 4567', warrantNumber: 'JP-10928', role: 'Registrar', isProvisional: false, status: 'Approved' },
  { id: 'usr-2', fullName: 'Sarah Jenkins', email: 'sarah.j@ajpa.org.nz', phone: '027 888 9911', warrantNumber: 'JP-12401', role: 'Admin', isProvisional: false, status: 'Approved' },
  { id: 'usr-3', fullName: 'David Chen', email: 'd.chen@ajpa.org.nz', phone: '022 454 1122', warrantNumber: 'JP-14502', role: 'Member', isProvisional: true, status: 'Approved' }
];

const INITIAL_ASSIGNMENTS = {
  'desk-remuera_slot-rm-1_2026-09-01': ['usr-1', 'usr-3'],
  'desk-newmarket_slot-nm-2_2026-09-26': ['usr-1']
};

export default function App() {
  // --- GLOBAL STATE ---
  const [currentUser, setCurrentUser] = useState(INITIAL_USERS[0]);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [activeTab, setActiveTab] = useState('calendar');
  const [deviceMode, setDeviceMode] = useState('responsive');

  const [regions, setRegions] = useState(INITIAL_REGIONS);
  const [serviceDesks, setServiceDesks] = useState(INITIAL_SERVICE_DESKS);
  const [slotTemplates, setSlotTemplates] = useState(INITIAL_SLOT_TEMPLATES);
  const [users, setUsers] = useState(INITIAL_USERS);
  const [followedDesks, setFollowedDesks] = useState(['desk-remuera', 'desk-parnell', 'desk-glen-innes', 'desk-newmarket']);

  const [slotAssignments, setSlotAssignments] = useState(INITIAL_ASSIGNMENTS);
  const [cancelledSlotInstances, setCancelledSlotInstances] = useState([]);

  // Desk Tab Filters
  const [deskViewFilter, setDeskViewFilter] = useState('Active');
  const [selectedDeskRegions, setSelectedDeskRegions] = useState(INITIAL_REGIONS.map(r => r.name));

  // Calendar Desk & Region Filters
  const [calendarDeskFilter, setCalendarDeskFilter] = useState('FOLLOWED');
  const [calendarRegionFilter, setCalendarRegionFilter] = useState('ALL');

  // LOG STATS MODAL STATE
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

  // FULL SLOT DETAILS MODAL STATE
  const [detailedSlotModal, setDetailedSlotModal] = useState(null);

  // REGISTRAR PORTAL STATE
  const [registrarSubTab, setRegistrarSubTab] = useState('members');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState({ fullName: '', email: '', phone: '', warrantNumber: '', role: 'Member', isProvisional: false, status: 'Approved' });
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState(null);

  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [editingRegionId, setEditingRegionId] = useState(null);
  const [regionForm, setRegionForm] = useState({ name: '', code: '' });
  const [pendingDeleteRegionId, setPendingDeleteRegionId] = useState(null);

  // Service Desk Modal
  const [createDeskModalOpen, setCreateDeskModalOpen] = useState(false);
  const [editingDeskId, setEditingDeskId] = useState(null);
  const [editDeskForm, setEditDeskForm] = useState({ code: '', name: '', address: '', region: 'Central Auckland', contactPerson: '', notes: '' });
  const [newDeskForm, setNewDeskForm] = useState({ code: '', name: '', address: '', region: 'Central Auckland', contactPerson: '', notes: '' });
  const [pendingDeleteDeskId, setPendingDeleteDeskId] = useState(null);

  useEffect(() => {
    if (currentUser.role === 'Member') {
      setCalendarDeskFilter('FOLLOWED');
    } else {
      setCalendarDeskFilter('ALL');
    }
  }, [currentUser.role]);

  const canManage = useMemo(() => {
    return currentUser.role === 'Admin' || currentUser.role === 'Registrar';
  }, [currentUser]);

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
    const newDesk = {
      id: `desk-${Date.now()}`,
      code: (newDeskForm.code || 'JP').toUpperCase().substring(0, 2),
      name: newDeskForm.name,
      address: newDeskForm.address,
      region: newDeskForm.region || regions[0]?.name || 'Central Auckland',
      contactPerson: newDeskForm.contactPerson || '',
      notes: newDeskForm.notes || '',
      status: 'Active'
    };
    setServiceDesks(prev => [...prev, newDesk]);
    setCreateDeskModalOpen(false);
    setNewDeskForm({ code: '', name: '', address: '', region: regions[0]?.name || 'Central Auckland', contactPerson: '', notes: '' });
  };

  const handleStartEditDesk = (desk) => {
    setEditingDeskId(desk.id);
    setEditDeskForm({
      code: desk.code || '',
      name: desk.name,
      address: desk.address,
      region: desk.region || regions[0]?.name || 'Central Auckland',
      contactPerson: desk.contactPerson,
      notes: desk.notes
    });
  };

  const handleSaveDeskDirectly = (e) => {
    e.preventDefault();
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

  const switchUserRole = (role) => {
    const found = users.find(u => u.role === role && u.status === 'Approved');
    if (found) {
      setCurrentUser(found);
      setIsAuthenticated(true);
    } else {
      setCurrentUser(prev => ({ ...prev, role }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      {/* TOAST NOTIFICATION */}
      {statsSuccessToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-500 flex items-center space-x-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-bold text-xs">Service Desk statistics logged successfully!</span>
        </div>
      )}

      {/* --- TOP BAR --- */}
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap justify-between items-center text-xs">
          <div className="flex items-center space-x-3">
            <span className="bg-amber-500 text-slate-950 px-2 py-0.5 rounded font-bold uppercase">Official</span>
            <span>Auckland Justices of the Peace Association Platform</span>
          </div>

          <div className="flex items-center space-x-4 mt-2 sm:mt-0">
            <div className="flex items-center bg-slate-800 rounded p-1 border border-slate-700">
              <button onClick={() => setDeviceMode('responsive')} className={`px-2 py-1 rounded flex items-center space-x-1 ${deviceMode === 'responsive' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300'}`}>
                <Monitor className="w-3 h-3" />
                <span>Web View</span>
              </button>
              <button onClick={() => setDeviceMode('mobile')} className={`px-2 py-1 rounded flex items-center space-x-1 ${deviceMode === 'mobile' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300'}`}>
                <Smartphone className="w-3 h-3" />
                <span>Mobile Sim</span>
              </button>
            </div>

            {isAuthenticated && (
              <div className="flex items-center space-x-2">
                <span className="text-slate-400">Demo Role:</span>
                <select value={currentUser.role} onChange={(e) => switchUserRole(e.target.value)} className="bg-slate-800 text-amber-400 border border-slate-700 rounded px-2 py-0.5 font-bold">
                  <option value="Registrar">Registrar</option>
                  <option value="Admin">Desk Admin</option>
                  <option value="Member">JP Member</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </header>

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

          {isAuthenticated ? (
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
              <button onClick={() => setIsAuthenticated(false)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white" title="Sign Out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex space-x-2 mt-4 sm:mt-0">
              <button onClick={() => setIsAuthenticated(true)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-md font-bold text-sm shadow">
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>

      {/* --- MAIN CONTAINER --- */}
      <div className={`mx-auto ${deviceMode === 'mobile' ? 'max-w-sm my-6 border-8 border-slate-800 rounded-[3rem] shadow-2xl overflow-hidden bg-slate-50' : 'max-w-7xl px-4 py-6'}`}>
        
        {!isAuthenticated ? (
          <div className="bg-white rounded-xl shadow-md p-8 border border-slate-200 text-center space-y-6">
            <h2 className="text-3xl font-extrabold text-slate-900">AJPA Roster Portal</h2>
            <button onClick={() => setIsAuthenticated(true)} className="bg-slate-900 text-white px-6 py-3 rounded-lg font-bold">Quick Demo Access</button>
          </div>
        ) : (
          <>
            {/* STREAMLINED NAVIGATION TABS */}
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

                      <div className={`grid gap-3 ${deviceMode === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-7'}`}>
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

                          return (
                            <div key={desk.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                              {isEditing ? (
                                <form onSubmit={handleSaveDeskDirectly} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-amber-300">
                                  <h4 className="font-bold text-slate-900 text-sm">Editing Service Desk Details</h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                    <div>
                                      <label className="block font-bold text-slate-700 mb-1">2-Letter Code</label>
                                      <input type="text" maxLength={2} required value={editDeskForm.code} onChange={(e) => setEditDeskForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} className="w-full border rounded p-2 uppercase font-extrabold text-amber-600" />
                                    </div>
                                    <div>
                                      <label className="block font-bold text-slate-700 mb-1">Region (Master Dropdown)</label>
                                      <select value={editDeskForm.region} onChange={(e) => setEditDeskForm(prev => ({ ...prev, region: e.target.value }))} className="w-full border rounded p-2 font-bold text-slate-900">
                                        {regions.map(r => (
                                          <option key={r.id} value={r.name}>{r.name} [{r.code}]</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="sm:col-span-1">
                                      <label className="block font-bold text-slate-700 mb-1">Name</label>
                                      <input type="text" required value={editDeskForm.name} onChange={(e) => setEditDeskForm(prev => ({ ...prev, name: e.target.value }))} className="w-full border rounded p-2" />
                                    </div>
                                    <div className="sm:col-span-3">
                                      <label className="block font-bold text-slate-700 mb-1">Address</label>
                                      <input type="text" required value={editDeskForm.address} onChange={(e) => setEditDeskForm(prev => ({ ...prev, address: e.target.value }))} className="w-full border rounded p-2" />
                                    </div>
                                  </div>
                                  <div className="flex justify-end space-x-2">
                                    <button type="button" onClick={() => setEditingDeskId(null)} className="px-4 py-2 rounded text-xs font-bold bg-slate-200">Cancel</button>
                                    <button type="submit" className="px-4 py-2 rounded text-xs font-bold bg-emerald-600 text-white">Save Changes</button>
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
                                          <button onClick={() => handleStartEditDesk(desk)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer">
                                            <Edit2 className="w-3.5 h-3.5" />
                                            <span>Edit Desk</span>
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

                                  <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">{desk.notes}</p>
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

            {/* TAB 4: REGISTRAR GOVERNANCE PORTAL */}
            {activeTab === 'registrar' && (currentUser.role === 'Registrar' || currentUser.role === 'Admin') && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Registrar Governance Portal</h2>
                    <p className="text-xs text-slate-500 mt-1">Maintain master lists for JP Members, Roles, Regions, and System Permissions.</p>
                  </div>

                  <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold">
                    <button onClick={() => setRegistrarSubTab('members')} className={`px-4 py-2 rounded-md flex items-center space-x-1.5 cursor-pointer ${registrarSubTab === 'members' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                      <Users className="w-3.5 h-3.5" />
                      <span>JP Members ({users.length})</span>
                    </button>
                    <button onClick={() => setRegistrarSubTab('regions')} className={`px-4 py-2 rounded-md flex items-center space-x-1.5 cursor-pointer ${registrarSubTab === 'regions' ? 'bg-slate-900 text-amber-400 shadow' : 'text-slate-600'}`}>
                      <Globe className="w-3.5 h-3.5" />
                      <span>Regions ({regions.length})</span>
                    </button>
                  </div>
                </div>

                {/* SUBTAB 1: JP MEMBERS MANAGEMENT */}
                {registrarSubTab === 'members' && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">Association Members & Officers</h3>
                        <p className="text-xs text-slate-500">JPs can volunteer at any service desk across the region.</p>
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
                            <tr key={u.id} className="hover:bg-slate-50 transition">
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
                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded font-bold text-[10px]">
                                  {u.status}
                                </span>
                              </td>
                              <td className="p-3 text-right space-x-1">
                                <button onClick={() => handleOpenEditUserModal(u)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer" title="Edit JP Details">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setPendingDeleteUserId(u.id)} className="p-1.5 bg-rose-50 hover:bg-rose-100 rounded text-rose-700 cursor-pointer" title="Delete JP Member">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SUBTAB 2: REGIONS MANAGEMENT */}
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

      {/* --- SLOT DETAILS MODAL WINDOW --- */}
      {detailedSlotModal && (
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

            {/* REGISTERED JP MEMBERS LIST */}
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
                    const member = userMap[jpId] || { fullName: 'Registered JP', warrantNumber: 'JP-MEMBER', email: 'jp@ajpa.org.nz' };
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

            {/* MODAL ACTION BUTTONS */}
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
      {logStatsOccurrence && (
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
                  <input type="text" required value={userForm.phone} onChange={(e) => setUserForm(prev => ({ ...prev, phone: e.target.value }))} className="w-full border rounded p-2" />
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

      {/* --- CREATE SERVICE DESK MODAL --- */}
      {createDeskModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
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
              <div>
                <label className="block font-bold text-slate-700 mb-1">Physical Address</label>
                <input type="text" required value={newDeskForm.address} onChange={(e) => setNewDeskForm(prev => ({ ...prev, address: e.target.value }))} className="w-full border rounded p-2" placeholder="Street address..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Region (Master Dropdown)</label>
                  <select value={newDeskForm.region} onChange={(e) => setNewDeskForm(prev => ({ ...prev, region: e.target.value }))} className="w-full border rounded p-2 font-bold text-slate-900">
                    {regions.map(r => (
                      <option key={r.id} value={r.name}>{r.name} [{r.code}]</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                  <input type="text" value={newDeskForm.contactPerson} onChange={(e) => setNewDeskForm(prev => ({ ...prev, contactPerson: e.target.value }))} className="w-full border rounded p-2" />
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-3">
                <button type="button" onClick={() => setCreateDeskModalOpen(false)} className="px-4 py-2 rounded font-bold bg-slate-100 text-slate-700">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded font-bold bg-slate-900 text-amber-400">Create Desk</button>
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