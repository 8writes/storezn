import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const className =
  "inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 border border-slate-300 rounded-sm px-3 py-1.5 hover:bg-slate-50 hover:border-slate-400 transition-colors cursor-pointer";

// A back-navigation control with enough visual weight (border, weight,
// contrast) to actually read as an action, not a faded caption. Pass
// `href` to navigate, or `onClick` for an in-page step back.
export function BackLink({ href, onClick, label = "Back" }) {
  if (href) {
    return (
      <Link href={href} className={className}>
        <ArrowLeft size={16} />
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      <ArrowLeft size={16} />
      {label}
    </button>
  );
}
