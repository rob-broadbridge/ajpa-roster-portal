import { X } from 'lucide-react';
import { useState } from 'react';

export default function CustomDateRangeModal({
  applyLabel,
  fromDate,
  onApply,
  onClose,
  requireCompleteDateRange = false,
  title,
  toDate
}) {
  const [draftFromDate, setDraftFromDate] = useState(fromDate);
  const [draftToDate, setDraftToDate] = useState(toDate);
  const hasIncompleteDateRange = requireCompleteDateRange && (!draftFromDate || !draftToDate);
  const hasInvalidDateRange = Boolean(draftFromDate && draftToDate && draftToDate < draftFromDate);
  const validationMessage = hasIncompleteDateRange
    ? 'Choose both a From Date and a To Date.'
    : hasInvalidDateRange
      ? 'To Date cannot be earlier than From Date.'
      : '';

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg" aria-label="Close date range dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">From Date</label>
            <input
              type="date"
              value={draftFromDate}
              onChange={(event) => setDraftFromDate(event.target.value)}
              className="w-full border rounded p-2 font-bold bg-white"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">To Date</label>
            <input
              type="date"
              value={draftToDate}
              onChange={(event) => setDraftToDate(event.target.value)}
              className="w-full border rounded p-2 font-bold bg-white"
            />
          </div>
        </div>

        {validationMessage && (
          <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
            {validationMessage}
          </p>
        )}

        <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
          <button
            onClick={() => onApply({ fromDate: draftFromDate, toDate: draftToDate })}
            disabled={Boolean(validationMessage)}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-amber-400 cursor-pointer disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
