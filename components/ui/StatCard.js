// Tailwind's JIT scanner needs full, static class strings -a template
// literal like `bg-${color}-100` won't get generated, so map to complete
// strings instead of interpolating.
const COLOR_CLASSES = {
  brand: "bg-brand-100 text-brand-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
};

export function StatCard({ icon: Icon, label, value, sub, color = "brand" }) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-3 flex items-start gap-3">
      {/* Hidden below sm - on a 2-up mobile grid the icon just eats space
          a big number needs, and isn't worth the room it takes. */}
      <div className={`hidden sm:flex w-8 h-8 rounded-sm items-center justify-center shrink-0 ${COLOR_CLASSES[color]}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0 w-full">
        {/* break-words (not truncate) - a stat that got clipped to "12,3…"
            is useless, wrapping to a second line is the better trade-off,
            and the smaller mobile size gives long numbers more room to
            fit on one line before that happens. */}
        <p className="text-base sm:text-lg font-bold text-slate-900 break-words">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-700 mt-0.5 break-words">{sub}</p>}
      </div>
    </div>
  );
}
