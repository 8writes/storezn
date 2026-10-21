import { ChevronDown } from "lucide-react";

// A titled card for a group of form fields.
//
// collapsible: the header becomes a button that shows/hides the body, for
// optional fields that shouldn't crowd the form ("More options"). Pass
// `open` + `onToggle` to control it. `actions` sit at the right of the
// header (e.g. a "Show / hide fields" link) and stay clickable either way.
export function FormSection({ title, description, children, className = "", collapsible = false, open = true, onToggle, actions = null }) {
  const heading = (
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-slate-900">{title}</span>
      {description && <span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span>}
    </span>
  );

  return (
    <section className={`rounded-sm border border-slate-200 bg-surface p-4 sm:p-5 ${className}`}>
      <div className={`flex items-start justify-between gap-3 ${!collapsible || open ? "mb-4" : ""}`}>
        {collapsible ? (
          <button type="button" onClick={onToggle} aria-expanded={open} className="flex flex-1 items-start gap-2 text-left cursor-pointer">
            <ChevronDown size={18} className={`mt-0.5 shrink-0 text-slate-500 transition-transform ${open ? "" : "-rotate-90"}`} />
            {heading}
          </button>
        ) : (
          <div className="border-l-2 border-brand-500 pl-3">{heading}</div>
        )}
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {(!collapsible || open) && children}
    </section>
  );
}
