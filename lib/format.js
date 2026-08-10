// Shared display formatting -currency, dates, and times -so every page
// renders these the same way instead of ad hoc toLocaleString()/raw-string
// calls scattered around. Client-safe (no db import).

// Manual "₦" + fixed 2-decimal thousands grouping, rather than
// Intl.NumberFormat's currency style: Node/browser ICU data for "NGN"
// inconsistently renders the code ("NGN") instead of the symbol depending
// on environment, so this guarantees the symbol every time.
export function formatCurrency(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return ",";
  return `₦${Number(amount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// For a plain "YYYY-MM-DD" date (attendance, term start/end) or a Date/ISO
// timestamp -no time-of-day shown.
export function formatDate(value) {
  if (!value) return ",";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return ",";
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

// For a full timestamp (assignment due date, submission time) -date +
// time-of-day together.
export function formatDateTime(value) {
  if (!value) return ",";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return ",";
  return d.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// For the timetable's stored "HH:MM" 24h strings -displayed as a 12h
// clock, which reads more naturally than "09:00"/"14:30" on a schedule.
export function formatTime(hhmm) {
  if (!hhmm) return ",";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
