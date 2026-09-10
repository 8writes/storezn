import { Pagination } from "./Pagination.js";

// The card + horizontal-scroll + <table> shell that ~30 list pages
// repeat. Caller supplies <thead>/<tbody> as children (so column layout
// stays per-page); this owns the frame, the scroll container, the header
// styling, row dividers/hover, an optional footer, and an optional
// <Pagination> wired to `pagination` / `onPageChange`.
//
//   <DataTable pagination={p} onPageChange={setPage}>
//     <thead><tr><Th>Name</Th><Th right>Total</Th></tr></thead>
//     <tbody>{rows.map(r => <tr key={r.id} className="tr">...</tr>)}</tbody>
//   </DataTable>
export function DataTable({ children, pagination, onPageChange, footer, dense = false, className = "" }) {
  return (
    <div className={`bg-surface border border-slate-200 rounded-sm shadow-xs overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table
          className={`w-full text-sm text-slate-700
            [&_thead_th]:bg-slate-50 [&_thead_th]:text-slate-500 [&_thead_th]:font-medium [&_thead_th]:text-left [&_thead_th]:whitespace-nowrap
            [&_thead_th]:border-b [&_thead_th]:border-slate-200
            [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100
            [&_tbody_tr:hover]:bg-slate-50/60
            ${dense ? "[&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2" : "[&_th]:px-4 [&_th]:py-2.5 [&_td]:px-4 [&_td]:py-3"}`}
        >
          {children}
        </table>
      </div>
      {footer}
      {pagination && onPageChange && <Pagination pagination={pagination} onPageChange={onPageChange} />}
    </div>
  );
}

// Optional header-cell helper - `right` aligns numeric columns.
export function Th({ children, right = false, className = "" }) {
  return <th className={`${right ? "text-right" : ""} ${className}`}>{children}</th>;
}
