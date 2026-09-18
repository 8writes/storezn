"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/pricing", label: "Pricing" },
  { href: "/status", label: "Status" },
];

// Shared header for the public marketing pages (landing, pricing,
// marketplace) - not used by the dashboard or storefront, which
// have their own headers. Sticky, with a simple slide-down mobile menu
// rather than the dashboard's full MobileNavDrawer - only 3 links, a
// full off-canvas drawer would be overkill here.
export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 bg-brand-900 transition-shadow duration-300 ${
        scrolled ? "shadow-lg shadow-black/10 border-b border-white/10" : "border-b border-white/0"
      }`}
    >
      {/* Faint dot texture, same treatment as the dashboard cards on
          /vendor/plus - a little depth instead of a flat fill. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "18px 18px" }}
      />
      <div className="relative max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16 gap-4">
        <Link href="/" className="shrink-0" onClick={() => setOpen(false)}>
          <Image src="/storezn-logo.png" alt="Storezn" width={120} height={29} priority unoptimized className="h-6 sm:h-7 w-auto" />
        </Link>

        <div className="hidden sm:flex items-center gap-7 text-sm">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="relative text-white/85 hover:text-white transition-colors py-1 after:absolute after:left-0 after:-bottom-0.5 after:h-px after:w-0 after:bg-white after:transition-[width] after:duration-200 hover:after:w-full"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/login"
            className="relative text-white/85 hover:text-white transition-colors py-1 after:absolute after:left-0 after:-bottom-0.5 after:h-px after:w-0 after:bg-white after:transition-[width] after:duration-200 hover:after:w-full"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="font-semibold bg-white text-brand-900 px-4 py-2 rounded-sm shadow-sm hover:bg-brand-50 hover:shadow-md transition-all"
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
        <div className="relative sm:hidden border-t border-white/10 bg-brand-900 px-4 py-3 flex flex-col gap-1">
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
