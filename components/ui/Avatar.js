import { User } from "lucide-react";

const SIZES = { sm: "w-8 h-8", md: "w-10 h-10" };
const ICON_SIZES = { sm: 14, md: 18 };

export function Avatar({ url, size = "sm" }) {
  if (url) {
    return <img src={url} alt="" className={`${SIZES[size]} rounded-full object-cover border border-slate-200 shrink-0`} />;
  }
  return (
    <div className={`${SIZES[size]} rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0`}>
      <User size={ICON_SIZES[size]} />
    </div>
  );
}
