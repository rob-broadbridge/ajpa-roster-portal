import { AlertTriangle } from 'lucide-react';

export default function DestructiveConfirmationDialog({
  cancelLabel = 'Cancel',
  confirmLabel,
  isOpen,
  message,
  onCancel,
  onConfirm,
  title
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
        <div className="flex items-center space-x-2 text-rose-700">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <h3 className="text-lg font-black">{title}</h3>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">{message}</p>
        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-xs font-black bg-rose-600 text-white hover:bg-rose-700 shadow cursor-pointer">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
