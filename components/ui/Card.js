// The surface language, defined once. ~400 places in the app hand-roll
// `bg-white border border-slate-200 rounded-sm p-4` - they migrate to
// this over time. A card is a white surface that lifts gently off the
// warm canvas (hairline border + a whisper of shadow).
const pads = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-6",
};

export function Card({ as: Tag = "div", pad = "md", interactive = false, className = "", children, ...props }) {
  return (
    <Tag
      className={`bg-white border border-slate-200/80 rounded-sm shadow-xs ${pads[pad] ?? pads.md}
        ${interactive ? "transition-[box-shadow,border-color] duration-150 hover:shadow-sm hover:border-slate-300 cursor-pointer" : ""}
        ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
