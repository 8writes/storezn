const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

const variants = {
  primary: "bg-brand-600 text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 disabled:shadow-none",
  // Warm retail CTA - storefront "Add to cart" / "Checkout", sale actions.
  accent: "bg-accent-600 text-white shadow-xs hover:bg-accent-700 active:bg-accent-800 disabled:bg-accent-300 disabled:shadow-none",
  secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 disabled:text-slate-400",
  danger: "bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 disabled:shadow-none",
  outline: "border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
};

export function Button({
  children,
  loading = false,
  fullWidth = false,
  size = "md",
  variant = "primary",
  className = "",
  disabled,
  ...props
}) {
  return (
    <button
      disabled={disabled || loading}
      data-loading={loading || undefined}
      className={`rounded-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap
        transition-[background-color,box-shadow,transform] duration-150 ease-out-soft
        active:scale-[0.985] disabled:cursor-not-allowed disabled:active:scale-100
        ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && <span className="spinner shrink-0" style={{ width: 16, height: 16 }} />}
      {children}
    </button>
  );
}
