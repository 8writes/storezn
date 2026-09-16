import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// The title row nearly every dashboard page hand-rolls: an <h1>, an
// optional line under it, an optional back link, and right-aligned
// actions that wrap under the title on a phone.
export function PageHeader({ title, description, actions, backHref, backLabel = "Back", className = "" }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-800 hover:text-slate-800 transition-colors"
        >
          <ChevronLeft size={15} /> {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-800 max-w-2xl">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
