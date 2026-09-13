import {
  Award,
  BarChart2,
  Calendar,
  FileText,
  HelpCircle,
  MapPin,
  UserCheck,
  Users
} from 'lucide-react';

const standardTabClassName = (isActive) => `flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition cursor-pointer ${
  isActive ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'
}`;

export default function PortalNavigation({ activeTab, canViewActivityAudit, currentUser, onSelectTab }) {
  return (
    <nav className="bg-white rounded-xl shadow-sm p-2 border border-slate-200 mb-6 flex flex-wrap gap-2" aria-label="Portal navigation">
      <button onClick={() => onSelectTab('calendar')} className={standardTabClassName(activeTab === 'calendar')}>
        <Calendar className="w-4 h-4" />
        <span>Calendar (12 Wks)</span>
      </button>

      <button onClick={() => onSelectTab('my-shifts')} className={standardTabClassName(activeTab === 'my-shifts')}>
        <UserCheck className="w-4 h-4" />
        <span>My Shifts</span>
      </button>

      <button onClick={() => onSelectTab('statistics')} className={standardTabClassName(activeTab === 'statistics')}>
        <BarChart2 className="w-4 h-4" />
        <span>Statistics</span>
      </button>

      <button onClick={() => onSelectTab('service-desks')} className={standardTabClassName(activeTab === 'service-desks')}>
        <MapPin className="w-4 h-4" />
        <span>Service Desks</span>
      </button>

      <button onClick={() => onSelectTab('my-profile')} className={standardTabClassName(activeTab === 'my-profile')}>
        <Users className="w-4 h-4" />
        <span>My Profile</span>
      </button>

      {canViewActivityAudit && (
        <button onClick={() => onSelectTab('activity-audit')} className={standardTabClassName(activeTab === 'activity-audit')}>
          <FileText className="w-4 h-4" />
          <span>Activity Log</span>
        </button>
      )}

      {currentUser.role === 'Registrar' && (
        <button onClick={() => onSelectTab('registrar')} className={standardTabClassName(activeTab === 'registrar')}>
          <Award className="w-4 h-4" />
          <span>Registrar Portal</span>
        </button>
      )}

      <button
        onClick={() => onSelectTab('help')}
        className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition cursor-pointer ${
          activeTab === 'help' ? 'bg-amber-500 text-slate-950 shadow' : 'bg-slate-900 text-amber-400 hover:bg-slate-800'
        }`}
      >
        <HelpCircle className="w-4 h-4" />
        <span>Help</span>
      </button>
    </nav>
  );
}
