"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { readTheme, saveTheme, THEME_EVENT } from "@/lib/theme.js";

// Sun/moon switch for the platform. `tone="light"` when it sits on a
// dark surface (the super-admin sidebar), otherwise it styles for a
// light-or-dark card.
export function ThemeToggle({ collapsed = false, tone = "auto" }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(readTheme());
    const on = () => setTheme(readTheme());
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);

  const dark = theme === "dark";
  const label = dark ? "Light mode" : "Dark mode";

  const base = `w-full flex items-center gap-3 py-2.5 text-sm font-medium transition-colors ${collapsed ? "justify-center px-0" : "px-4"}`;
  const skin =
    tone === "light"
      ? "text-white/70 hover:bg-white/10 hover:text-white"
      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900";

  return (
    <button type="button" onClick={() => setTheme(saveTheme(dark ? "light" : "dark"))} title={label} className={`${base} ${skin} cursor-pointer`}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      {!collapsed && label}
    </button>
  );
}
