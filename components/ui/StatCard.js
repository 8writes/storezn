import Link from "next/link";
import { compactNumber } from "@/lib/format.js";

// Full static class strings - Tailwind's scanner can't see interpolated
// ones. The icon is a big, low-opacity watermark sitting behind the
// text over on the right, not a chip beside it - brightens a touch on
// hover, same treatment as the landing page's feature cards.
const ICON_FADE = {
  brand: "text-brand-600/8 group-hover:text-brand-600/14",
  green: "text-green-600/8 group-hover:text-green-600/14",
  amber: "text-amber-600/8 group-hover:text-amber-600/14",
  red: "text-red-600/8 group-hover:text-red-600/14",
  accent: "text-accent-600/8 group-hover:text-accent-600/14",
  slate: "text-slate-600/8 group-hover:text-slate-600/14",
};

// `value` a number is auto-abbreviated (1.2K / 3.4M) and the full figure
// is put on `title`. `value` a string (a pre-formatted currency, say) is
// shown as-is; pass `title` for its exact form.
export function StatCard({ icon: Icon, label, value, sub, color = "brand", href, title, className = "" }) {
  const isNum = typeof value === "number";
  const display = isNum ? compactNumber(value) : value;
  const tip = title || (isNum ? Number(value).toLocaleString("en-NG") : undefined);

  const base =
    `group relative overflow-hidden bg-surface border border-slate-200 rounded-sm shadow-xs p-3.5 sm:p-4 ` +
    `transition-[box-shadow,border-color] duration-150 ${className}`;
  const inner = (
    <>
      {Icon && (
        <Icon
          size={68}
          strokeWidth={1.25}
          aria-hidden="true"
          className={`pointer-events-none absolute -right-3 -bottom-4 transition-colors duration-300 ${ICON_FADE[color] || ICON_FADE.brand}`}
        />
      )}
      <div className="relative min-w-0 w-full">
        <p title={tip} className={`text-lg sm:text-xl font-bold text-slate-900 tabular-nums leading-tight truncate ${tip ? "cursor-help" : ""}`}>
          {display}
        </p>
        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-800">{label}</p>
        {sub && <p className="text-xs text-slate-600 mt-1 break-words">{sub}</p>}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${base} hover:shadow-sm hover:border-brand-300`}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}
