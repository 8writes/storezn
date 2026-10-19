// leadingText (optional): a symbol shown inside the field before the value,
// e.g. "₦" on a price, so it's clear what unit is being typed. Without it
// the markup is exactly as before.
export function Input({ label, hint, error, className = "", id, leadingText, ...props }) {
  const inputId = id || props.name;
  const field = (
    <input
      id={inputId}
      aria-invalid={error ? true : undefined}
      className={`w-full ${leadingText ? "pl-7 pr-3" : "px-3"} py-2 rounded-sm border bg-surface text-base sm:text-sm text-slate-900 placeholder:text-slate-400
        outline-none transition-[border-color,box-shadow] duration-150
        ${error
          ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
          : "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"}
        disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  );
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      {leadingText ? (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base sm:text-sm text-slate-600"
          >
            {leadingText}
          </span>
          {field}
        </div>
      ) : (
        field
      )}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-800">{hint}</p>
      ) : null}
    </div>
  );
}
