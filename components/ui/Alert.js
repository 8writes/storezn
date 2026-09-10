import { AlertTriangle, Info, CheckCircle2, ShieldAlert } from "lucide-react";

// The tinted "heads-up" panel ~15 dashboard spots hand-roll
// (`bg-amber-50 border-amber-200 ...`). Tone drives colour + default
// icon; the `-100` tint step + `text-*-800` are both remapped for dark,
// and `border-current/15` derives a subtle edge from the text colour so
// it works in either theme.
const TONES = {
  info: { cls: "bg-info-100 text-info-700", Icon: Info },
  warning: { cls: "bg-amber-100 text-amber-800", Icon: AlertTriangle },
  danger: { cls: "bg-red-100 text-red-700", Icon: ShieldAlert },
  success: { cls: "bg-brand-100 text-brand-800", Icon: CheckCircle2 },
};

export function Alert({ tone = "info", title, icon, children, className = "" }) {
  const t = TONES[tone] || TONES.info;
  const Icon = icon || t.Icon;
  return (
    <div className={`flex items-start gap-3 rounded-sm border border-current/15 px-4 py-3 text-sm ${t.cls} ${className}`}>
      <Icon size={18} className="shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
