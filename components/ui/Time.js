import { formatTime, formatDate, formatDateLong, formatDateTime } from "../../lib/formatDate.js";

// Small presentational components so every screen renders dates/times the
// same way (always 12-hour with AM/PM).
export function Time({ value, className }) {
  return <span className={className}>{formatTime(value)}</span>;
}

export function DateLabel({ value, long = false, opts, className }) {
  return <span className={className}>{long ? formatDateLong(value) : formatDate(value, opts)}</span>;
}

export function DateTime({ value, className }) {
  return <span className={className}>{formatDateTime(value)}</span>;
}
