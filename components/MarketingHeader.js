"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const LINKS = [
  { href: "/stores", label: "Marketplace" },
  { href: "/pricing", label: "Pricing" },
];

// Shared header for the public marketing pages (landing, pricing,
// marketplace) - not used by the dashboard or storefront, which
// have their own headers. Sticky, with a simple slide-down mobile menu
// rather than the dashboard's full MobileNavDrawer - only 3 links, a
// full off-canvas drawer would be overkill here.
export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-brand-900 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16 gap-4">
        <Link href="/" className="shrink-0" onClick={() => setOpen(false)}>
          <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} priority unoptimized className="h-6 sm:h-7 w-auto" />
        </Link>

        <div className="hidden sm:flex items-center gap-5 text-sm">
          {LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="text-white hover:text-white/80 transition-colors">
              {label}
            </Link>
          ))}
          <Link href="/login" className="text-white hover:text-white/80 transition-colors">
            Log in
          </Link>
          <Link
            href="/signup"
            className="font-semibold bg-white text-brand-900 px-4 py-2 rounded-sm hover:bg-brand-50 transition-colors"
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
          className="sm:hidden w-9 h-9 flex items-center justify-center text-white cursor-pointer"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="sm:hidden border-t border-white/10 bg-brand-900 px-4 py-3 flex flex-col gap-1">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="px-2 py-2.5 text-sm text-white/90 hover:text-white transition-colors"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="px-2 py-2.5 text-sm text-white/90 hover:text-white transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            onClick={() => setOpen(false)}
            className="mt-1 text-center font-semibold bg-white text-brand-900 px-4 py-2.5 rounded-sm hover:bg-brand-50 transition-colors"
          >
            Get started
          </Link>
        </div>
      )}
    </header>
  );
}
