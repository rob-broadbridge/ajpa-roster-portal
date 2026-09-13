import { CheckCircle2, Users } from 'lucide-react';

export default function PortalAlerts({
  pendingMembersNoticeCount,
  registrationSuccessToast,
  statsSuccessToast,
  onDismissPendingMembersNotice
}) {
  return (
    <>
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
                onClick={onDismissPendingMembersNotice}
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold rounded-lg text-xs uppercase tracking-wider shadow transition cursor-pointer flex items-center justify-center space-x-1"
              >
                <span>Ok</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {statsSuccessToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-500 flex items-center space-x-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-bold text-xs">Service Desk statistics updated successfully!</span>
        </div>
      )}

      {registrationSuccessToast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-amber-500 flex items-start space-x-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <span className="font-bold text-xs leading-relaxed">Registration saved. A confirmation email and calendar appointment will be sent in approximately five minutes if you remain registered.</span>
        </div>
      )}
    </>
  );
}
