import { AlertTriangle } from 'lucide-react';

const ACTION_DETAILS = {
  SAVE: {
    confirmLabel: 'Yes, Save Changes',
    message: 'Are you sure you want to save changes to this shift slot template? This will update all future occurrences on the 12-week calendar.',
    title: 'Confirm Save Changes'
  },
  CANCEL: {
    confirmLabel: 'Yes, Discard Changes',
    message: 'Are you sure you want to cancel? Any unsaved edits will be discarded.',
    title: 'Confirm Cancel Editing'
  },
  DELETE: {
    confirmLabel: 'Yes, Delete Slot',
    message: 'Are you sure you want to permanently delete this shift slot template? Active calendar shifts generated from this slot will be removed.',
    title: 'Confirm Slot Deletion'
  }
};

export default function SlotActionConfirmationDialog({ action, onCancel, onConfirm }) {
  if (!action) return null;

  const details = ACTION_DETAILS[action];
  const isDelete = action === 'DELETE';

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
        <div className="flex items-center space-x-2 text-slate-900">
          <AlertTriangle className={`w-6 h-6 shrink-0 ${isDelete ? 'text-rose-600' : 'text-amber-500'}`} />
          <h3 className="text-lg font-black">{details.title}</h3>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">{details.message}</p>
        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">
            Go Back
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-black shadow cursor-pointer ${
              isDelete ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-slate-900 hover:bg-slate-800 text-amber-400'
            }`}
          >
            {details.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
