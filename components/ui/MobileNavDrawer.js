"use client";
import { useEffect } from "react";
import { X } from "lucide-react";

// Slide-in-from-left mobile nav panel, shared shell for the public,
// dashboard, and admin headers (each supplies its own links as children).
// Always mounted (not conditionally rendered) so both the open AND close
// transitions can animate, sm:hidden keeps it inert and invisible on
// desktop regardless of `open`.
export function MobileNavDrawer({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    // Prevent the page behind the drawer from scrolling while it's open.
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
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
        className={`absolute inset-y-0 left-0 w-72 max-w-[80%] bg-brand-900 shadow-xl flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 h-16 border-b border-slate-800 shrink-0">
          <span className="text-white font-semibold">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">{children}</div>
      </div>
    </div>
  );
}
