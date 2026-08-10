"use client";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useState } from "react";
import { MobileNavDrawer } from "./ui/MobileNavDrawer.js";

export function PublicNav() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="bg-brand-900 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-extrabold text-white cursor-pointer tracking-widest shrink-0"
        >
          <span>School Manager</span>
        </Link>

        <Link
          href="/login"
          className="hidden sm:inline-flex items-center text-sm font-semibold bg-brand-500 text-white px-4 py-2 rounded-sm hover:bg-brand-400 transition-colors cursor-pointer"
        >
          Sign In
        </Link>

        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
          className="sm:hidden text-slate-300 hover:text-white cursor-pointer"
        >
          <Menu size={22} />
        </button>
      </div>

      <MobileNavDrawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} title="Menu">
        <div className="px-4 pt-3">
          <Link
            href="/login"
            onClick={() => setMobileNavOpen(false)}
            className="block text-center text-sm font-semibold bg-brand-500 text-white px-4 py-2.5 rounded-sm hover:bg-brand-400 transition-colors cursor-pointer"
          >
            Sign In
          </Link>
        </div>
      </MobileNavDrawer>
    </header>
  );
}
