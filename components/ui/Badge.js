const colors = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-green-100 text-green-700",
  blue: "bg-brand-100 text-brand-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
};

export function Badge({ children, color = "slate" }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}
