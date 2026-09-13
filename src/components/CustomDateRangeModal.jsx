import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function CustomDateRangeModal({
  applyLabel,
  fromDate,
  isOpen,
  onApply,
  onClose,
  title,
  toDate
}) {
  const [draftFromDate, setDraftFromDate] = useState(fromDate);
  const [draftToDate, setDraftToDate] = useState(toDate);

  useEffect(() => {
    if (!isOpen) return;
    setDraftFromDate(fromDate);
    setDraftToDate(toDate);
  }, [fromDate, isOpen, toDate]);

  if (!isOpen) return null;

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

        <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
          <button onClick={() => onApply({ fromDate: draftFromDate, toDate: draftToDate })} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-amber-400 cursor-pointer">
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
