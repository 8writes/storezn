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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-700 max-w-2xl leading-5">{description}</p>}
        </div>
        {actions && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:shrink-0 [&>a]:w-full sm:[&>a]:w-auto [&_button]:w-full sm:[&_button]:w-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
