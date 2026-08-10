const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
  secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  outline: "border border-slate-300 text-slate-700 hover:bg-slate-50",
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
      className={`rounded-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && <span className="spinner" />}
      {children}
    </button>
  );
}
