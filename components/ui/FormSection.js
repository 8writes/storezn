export function FormSection({ title, description, children, className = "" }) {
  return (
    <section className={`rounded-sm border border-slate-200 bg-slate-50/50 p-4 sm:p-5 ${className}`}>
      <div className="mb-4 border-l-2 border-brand-500 pl-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-5 text-slate-600">{description}</p>}
      </div>
      {children}
    </section>
  );
}
