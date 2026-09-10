const colors = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-brand-100 text-brand-800",
  brand: "bg-brand-100 text-brand-800",
  // Was silently green - now an actual blue (see --color-info-* in globals).
  blue: "bg-info-50 text-info-700",
  info: "bg-info-50 text-info-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  // Warm retail accent - "Sale", "New", "Bestseller".
  accent: "bg-accent-100 text-accent-700",
};

export function Badge({ children, color = "slate" }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium ${colors[color] || colors.slate}`}>
      {children}
    </span>
  );
}
