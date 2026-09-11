"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

// Slide-in-from-left mobile nav panel, shared shell for the public,
// dashboard, and admin headers (each supplies its own links as children).
// Always mounted (not conditionally rendered) so both the open AND close
// transitions can animate, sm:hidden keeps it inert and invisible on
// desktop regardless of `open`.
// `muted` = the calm light shell (vendor dashboard, follows the theme);
// default is the solid dark-green panel used by the public + admin headers.
export function MobileNavDrawer({ open, onClose, title, children, footer, muted = false }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    // Lock the page behind the drawer. Both <html> and <body> - depending
    // on layout either one can be the actual scroll container, and
    // `overflow: hidden` on just body doesn't always take.
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    // Flag PullToRefresh off while the drawer is open - it listens on
    // window and would otherwise read a downward swipe over the drawer
    // (or its backdrop) as a pull-to-refresh gesture, since the page
    // behind it is locked at scrollY 0 the whole time.
    document.body.dataset.navDrawerOpen = "true";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
      delete document.body.dataset.navDrawerOpen;
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 sm:hidden transition-opacity duration-200 ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`absolute inset-y-0 left-0 w-72 max-w-[80%] shadow-xl flex flex-col transition-transform duration-200 ${
          muted ? "bg-surface" : "bg-brand-900"
        } ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className={`flex items-center justify-between px-4 h-16 border-b shrink-0 ${muted ? "border-slate-200" : "border-slate-800"}`}>
          <span className={`font-semibold ${muted ? "text-slate-900" : "text-white"}`}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className={`w-9 h-9 -mr-2 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              muted ? "text-slate-500 hover:text-slate-900 hover:bg-slate-100" : "text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">{children}</div>
        {footer && (
          // Visually and structurally separate from the scrollable nav
          // list above (own border-top section, not just another item in
          // the same flow) - specifically so a quick scroll/tap through
          // the menu can't land on Sign out by accident.
          <div className={`border-t shrink-0 pt-1 ${muted ? "border-slate-200" : "border-slate-800"}`}>{footer}</div>
        )}
      </div>
    </div>
  );
}
