export function Input({ label, hint, error, className = "", id, ...props }) {
  const inputId = id || props.name;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`w-full px-3 py-2 rounded-sm border bg-white text-base sm:text-sm text-slate-900 placeholder:text-slate-400
          outline-none transition-[border-color,box-shadow] duration-150
          ${error
            ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            : "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"}
          disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${className}`}
        {...props}
      />
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
