import { LogOut } from 'lucide-react';

export default function PlatformHeader({ currentUser, isAuthenticated, onSignOut }) {
  return (
    <header className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white relative overflow-hidden border-b-4 border-amber-500">
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
              <div className="text-xs text-slate-400">
                {currentUser.warrantNumber} • <span className="text-amber-400 font-semibold">{currentUser.role}</span>
              </div>
            </div>
            <button
              onClick={onSignOut}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
