import Link from "next/link";
import { compactNumber } from "@/lib/format.js";

// Full static class strings - Tailwind's scanner can't see interpolated
// ones. Icon chip: quiet tint in light, holds up on the dark surface.
const CHIP = {
  brand: "bg-brand-100 text-brand-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  accent: "bg-accent-100 text-accent-700",
  slate: "bg-slate-100 text-slate-600",
};

// `value` a number is auto-abbreviated (1.2K / 3.4M) and the full figure
// is put on `title`. `value` a string (a pre-formatted currency, say) is
// shown as-is; pass `title` for its exact form.
export function StatCard({ icon: Icon, label, value, sub, color = "brand", href, title }) {
  const isNum = typeof value === "number";
  const display = isNum ? compactNumber(value) : value;
  const tip = title || (isNum ? Number(value).toLocaleString("en-NG") : undefined);

  const base =
    "group bg-surface border border-slate-200 rounded-sm shadow-xs p-3.5 sm:p-4 flex items-start gap-3 " +
    "transition-[box-shadow,border-color] duration-150";
  const inner = (
    <>
      {Icon && (
        <div className={`hidden sm:flex w-9 h-9 rounded-sm items-center justify-center shrink-0 ${CHIP[color] || CHIP.brand}`}>
          <Icon size={17} />
        </div>
      )}
      <div className="min-w-0 w-full">
        <p title={tip} className={`text-lg sm:text-xl font-bold text-slate-900 tabular-nums leading-tight truncate ${tip ? "cursor-help" : ""}`}>
          {display}
        </p>
        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
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
