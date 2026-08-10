export function Textarea({ label, className = "", ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
      <textarea
        className={`w-full px-3 py-2 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500 ${className}`}
        {...props}
      />
    </div>
  );
}
