"use client";
import { Input } from "./Input.js";

function formatDisplay(raw) {
  if (!raw) return "";
  const [intPart, decPart] = String(raw).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
}

// Formats a plain numeric string with thousands separators as it's typed,
// e.g. "12000" displays as "12,000". value/onChange both deal in the raw
// unformatted numeric string (no commas) - same contract as a plain
// number input - so callers just Number(value) it like any other price
// field, they don't need to know this renders differently.
export function PriceInput({ label, value, onChange, ...props }) {
  const handleChange = (e) => {
    // Strip everything but digits and keep only the first decimal point.
    const raw = e.target.value.replace(/,/g, "").replace(/[^\d.]/g, "");
    const firstDot = raw.indexOf(".");
    const cleaned = firstDot === -1 ? raw : raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
    onChange(cleaned);
  };

  return (
    <Input
      label={label}
      type="text"
      inputMode="decimal"
      value={formatDisplay(value)}
      onChange={handleChange}
      {...props}
    />
  );
}
