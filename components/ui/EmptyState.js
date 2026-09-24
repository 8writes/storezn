// A consistent, friendly "nothing here yet" panel for the ~20 places
// that each roll their own centred grey sentence. Optional icon (a
// lucide component), a title, a line of context, and one action.
export function EmptyState({ icon: Icon, title, description, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center rounded-sm border border-dashed border-slate-300 bg-surface/70 px-6 py-12 ${className}`}>
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon size={20} />
        </div>
      )}
      {title && <p className="text-sm font-semibold text-slate-900">{title}</p>}
      {description && <p className="mt-1 max-w-sm text-sm leading-5 text-slate-700">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
