import { DEFAULT_ROSTER_TIME_ZONE } from '../utils/calendarDates.js';

// These values are used only for the opt-in local demonstration mode and as
// harmless initial state while an authenticated Supabase roster is loading.
export const INITIAL_REGIONS = [
  { id: 'reg-1', name: 'Auckland East', code: 'AKL-E', timezone: DEFAULT_ROSTER_TIME_ZONE }
];

export const INITIAL_USERS = [
  { id: 'usr-1', fullName: 'Rob Broadbridge (R)', email: 'rob@broadbridge.co.nz', phone: '274909378', warrantNumber: 'JP-99999', role: 'Registrar', isProvisional: false, status: 'Approved' },
  { id: 'usr-2', fullName: 'Rob Broadbridge (A)', email: 'rob.broadbridge@gmail.com', phone: '', warrantNumber: 'JP-88888', role: 'Admin', isProvisional: false, status: 'Approved' },
  { id: 'usr-3', fullName: 'Rob Broadbbridge (JP)', email: 'jp@broadbridge.co.nz', phone: '', warrantNumber: 'JP-25138', role: 'Member', isProvisional: false, status: 'Approved' }
];

export const INITIAL_SERVICE_DESKS = [
  { id: 'desk-remuera', code: 'RM', name: 'Remuera Library', address: '429 Remuera Road, Remuera, Auckland 1050', region: 'Auckland East', primaryAdminId: 'usr-1', secondaryAdminId: 'usr-2', siteContactName: '', siteContactEmail: '', contactPerson: '', notes: 'The desk is set up in the library to the right of the front entrance. See library staff for signs. They have a pull up sign behind the desk.', status: 'Active' },
  { id: 'desk-glen-innes', code: 'GI', name: 'Glen Innes Library', address: '108 Line Road, Glen Innes, Auckland 1072', region: 'Auckland East', primaryAdminId: 'usr-1', secondaryAdminId: 'usr-2', siteContactName: '', siteContactEmail: '', contactPerson: '', notes: 'Desk is set up to the right as you enter the library. Put sign in the foyer outside on the path at the start and bring it back in at the end of the shift.', status: 'Active' },
  { id: 'desk-st-heliers', code: 'SH', name: 'St Heliers Library', address: '32 Saint Heliers Bay Road, St Heliers, Auckland 1071', region: 'Auckland East', primaryAdminId: 'usr-1', secondaryAdminId: 'usr-2', siteContactName: '', siteContactEmail: '', contactPerson: '', notes: 'Set up is in the room to the right as you come in the front door.', status: 'Active' },
  { id: 'desk-panmure', code: 'PN', name: 'Panmure Library', address: '7/13 Pilkington Road, Panmure, Auckland 1072', region: 'Auckland East', primaryAdminId: 'usr-1', secondaryAdminId: 'usr-2', siteContactName: '', siteContactEmail: '', contactPerson: '', notes: 'Tables are set up in the centre of the library with chairs for people waiting.', status: 'Active' },
  { id: 'desk-parnell', code: 'PL', name: 'Parnell Community Centre', address: 'Jubilee Building 545 Parnell Road, Parnell, Auckland 1052', region: 'Auckland East', primaryAdminId: 'usr-1', secondaryAdminId: 'usr-2', siteContactName: '', siteContactEmail: '', contactPerson: '', notes: '', status: 'Active' },
  { id: 'desk-newmarket', code: 'NM', name: 'Newmarket Westfield', address: '277 Broadway, Newmarket, Auckland 1023', region: 'Auckland East', primaryAdminId: 'usr-1', secondaryAdminId: 'usr-2', siteContactName: '', siteContactEmail: '', contactPerson: '', notes: 'The desk is at the entrance to Westfield at the corner of Morrow Street and Broadway. See the staff at the information desk to register your car for free parking. Desk is down the walkway to the lifts near the information counter. A sign can be pulled out into the mall and returned at the end of the shift.', status: 'Active' },
  { id: 'desk-otahuhu', code: 'OH', name: 'Otahuhu Library', address: '28/30 Mason Avenue, Ōtāhuhu, Auckland 1062', region: 'Auckland East', primaryAdminId: 'usr-1', secondaryAdminId: 'usr-2', siteContactName: '', siteContactEmail: '', contactPerson: '', notes: 'The desk is in a room to the left as you come up the stairs from the entrance in the mall.', status: 'Active' }
];

export const INITIAL_SLOT_TEMPLATES = [
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

export const INITIAL_ASSIGNMENTS = {
  'desk-glen-innes_slot-gi-4_2026-09-03': ['usr-3'],
  'desk-remuera_slot-rm-2_2026-09-04': ['usr-3'],
  'desk-newmarket_slot-nm-2_2026-09-05': ['usr-3'],
  'desk-glen-innes_slot-gi-4_2026-09-10': ['usr-3'],
  'desk-remuera_slot-rm-2_2026-09-11': ['usr-3'],
  'desk-newmarket_slot-nm-2_2026-09-12': ['usr-3']
};

export const INITIAL_LOGGED_STATISTICS = [
  {
    id: 'stat-1', jpId: 'usr-3', jpName: 'Rob Broadbbridge (JP)', warrantNumber: 'JP-25138',
    deskId: 'desk-glen-innes', deskName: 'Glen Innes Library', deskCode: 'GI', region: 'Auckland East',
    slotId: 'slot-gi-4', occurrenceKey: 'desk-glen-innes_slot-gi-4_2026-09-03', date: '2026-09-03',
    startTime: '09:30', endTime: '11:30', noOfJpDuties: 1, noOfClients: 21, noOfHoursWorked: 2.0,
    certifiedCopies: 66, statutoryDeclarations: 9, signatureWitnessed: 1, affidavits: 0, other: 0,
    notes: 'Morning shift at GI library'
  }
];

export const INITIAL_FOLLOWED_DESKS = [
  'desk-remuera', 'desk-glen-innes', 'desk-st-heliers', 'desk-panmure',
  'desk-parnell', 'desk-newmarket', 'desk-otahuhu'
];
