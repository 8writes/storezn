export function Input({ label, className = "", ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
      <input
        className={`w-full px-3 py-2 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${className}`}
        {...props}
      />
    </div>
  );
}
