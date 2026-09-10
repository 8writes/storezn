"use client";

// A real iOS-style toggle pill, for a plain on/off setting that reads
// better as a switch than a checkbox+label pair - the animated knob
// makes the current state (and the fact that it's clickable) obvious
// at a glance.
export function Switch({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 bg-surface border border-slate-200 rounded-sm p-4 cursor-pointer text-left hover:border-brand-300 transition-colors"
    >
      <div className="min-w-0">
        {label && <p className="text-sm font-medium text-slate-900">{label}</p>}
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <span className={`shrink-0 relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-brand-600" : "bg-slate-200"}`}>
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-surface rounded-full shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
