import Link from "next/link";

// A row of shortcut cards to a dashboard's main sections, used as the
// "quick links" block under each role's summary stats.
export function QuickLinks({ links }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-3 bg-white border border-slate-200 rounded-sm p-4 hover:border-brand-300 hover:bg-brand-50 transition-colors"
        >
          <Icon size={18} className="text-brand-600 shrink-0" />
          <span className="text-sm font-medium text-slate-700">{label}</span>
        </Link>
      ))}
    </div>
  );
}
