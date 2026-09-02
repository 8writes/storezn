"use client";
import { useEffect, useRef, useState } from "react";
import { Barcode } from "lucide-react";

// A button that, once armed, captures the next barcode-scanner burst
// (fast keystrokes ending in Enter) and hands the code to onScan. Lets a
// vendor fill a SKU field by scanning the item instead of typing a
// 13-digit EAN. Esc or 15s of inactivity disarms it.
export function BarcodeScanButton({ onScan, className = "" }) {
  const [armed, setArmed] = useState(false);
  const buf = useRef({ chars: "", last: 0 });

  useEffect(() => {
    if (!armed) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setArmed(false);
        return;
      }
      const now = Date.now();
      if (e.key === "Enter") {
        e.preventDefault();
        const code = buf.current.chars.trim();
        buf.current.chars = "";
        if (code.length >= 3) {
          onScan(code);
          setArmed(false);
        }
        return;
      }
      if (e.key.length !== 1) return;
      e.preventDefault();
      if (now - buf.current.last > 120) buf.current.chars = "";
      buf.current.chars += e.key;
      buf.current.last = now;
    };
    window.addEventListener("keydown", onKey, true);
    const t = setTimeout(() => setArmed(false), 15000);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearTimeout(t);
    };
  }, [armed, onScan]);

  return (
    <button
      type="button"
      onClick={() => setArmed((a) => !a)}
      className={`inline-flex shrink-0 items-center gap-1.5 px-3 py-2 rounded-sm border text-sm font-medium cursor-pointer transition-colors ${
        armed ? "border-brand-600 bg-brand-50 text-brand-700 animate-pulse" : "border-slate-300 text-slate-700 hover:bg-slate-50"
      } ${className}`}
    >
      <Barcode size={15} />
      {armed ? "Scan now…" : "Scan"}
    </button>
  );
}
