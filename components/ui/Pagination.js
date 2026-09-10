import { ChevronLeft, ChevronRight } from "lucide-react";

// Paired with lib/pagination.js's { page, pageSize, total, totalPages }
// response shape. `onPageChange` receives the new 1-indexed page.
const btn =
  "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm border border-slate-300 text-slate-700 font-medium " +
  "transition-colors hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 text-xs sm:text-sm text-slate-500">
      <span className="tabular-nums">
        Page {page} of {totalPages}
        <span className="hidden sm:inline"> · {total.toLocaleString()} total</span>
      </span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={btn}>
          <ChevronLeft size={14} /> Prev
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className={btn}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
