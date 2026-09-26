"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

// Debounced search box for server-side-filtered tables: keystrokes update
// the visible input immediately, but `onSearch` (which should trigger a
// re-fetch) only fires 350ms after the user stops typing - avoids firing
// a request per keystroke against the database.
export function SearchInput({ value, onSearch, placeholder = "Search...", className = "" }) {
  const [text, setText] = useState(value || "");
  // Keeps the box in step when the parent changes `value` itself (clearing
  // a filter, say). Compared during render against the last value we saw,
  // which is React's documented way to adjust state on a prop change -
  // an effect for this rendered the stale text once before correcting it.
  const [lastValue, setLastValue] = useState(value || "");
  if ((value || "") !== lastValue) {
    setLastValue(value || "");
    setText(value || "");
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      if (text !== (value || "")) onSearch(text);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 rounded-sm border border-slate-300 bg-surface text-base sm:text-sm text-slate-900 placeholder:text-slate-400
          outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
    </div>
  );
}
