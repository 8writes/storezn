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

// Rounds to 1 decimal past KB, whole numbers for bytes - matches how
// storage limits are already surfaced elsewhere (e.g. upload-route error
// messages), see lib/storePlan.js's getStorageLimitBytes.
export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${unitIndex === 0 ? value : value.toFixed(1)} ${units[unitIndex]}`;
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

// Compact "how long ago" - "just now", "5m ago", "3h ago", "2d ago",
// then falls back to a plain date past a week. For last-seen / activity
// timestamps.
export function formatRelativeTime(value) {
  if (!value) return "never";
  const d = value instanceof Date ? value : new Date(value);
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms)) return "never";
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

const CONDITION_LABELS = { new: "Brand New", fairly_used: "Fairly Used", used: "Used" };

// products.condition is only meaningful for physical products (see
// lib/db/schema.js) - callers already gate on productType === "physical"
// before showing this.
export function formatCondition(condition) {
  return CONDITION_LABELS[condition] || condition;
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
