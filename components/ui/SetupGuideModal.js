"use client";
import { useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Info, X } from "lucide-react";

// Controlled, dismissible checklist walking a new vendor through the
// steps that actually unlock a working store (see vendor/dashboard's
// buildSetupSteps for what counts as "done" for each one). Modal
// chrome/behavior matches ConfirmModal.js (backdrop click + Escape to
// close, body scroll locked while open) for consistency across the app.
export function SetupGuideModal({ open, onClose, steps }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
      {/* transform: translateZ(0) forces just the backdrop onto its own
          compositing layer immediately - without it, mobile Safari
          sometimes doesn't actually paint a fixed overlay until the next
          scroll/touch event forces a repaint, showing a blank/broken
          screen right after it opens. Applied here, not on the scrolling
          parent above: a transform on that parent would make it the
          containing block for this backdrop's own `fixed` positioning,
          which then scrolls away with the parent's content instead of
          staying pinned full-height - the opposite of what this is for. */}
      <div className="fixed inset-0 bg-black/50" style={{ transform: "translateZ(0)" }} onClick={onClose} />
      <div className="relative bg-white rounded-sm shadow-xl w-full max-w-lg p-6 space-y-5 my-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Get your store ready</h2>
            <p className="text-sm text-slate-500 mt-1">
              {doneCount} of {steps.length} done - finish these and you&apos;re ready to sell.
            </p>
            <p className="text-xs text-slate-700 mt-2">
              Tip: Tap on the <Info size={12} className="inline align-text-bottom mx-0.5" /> icon next to a field for more details.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>

        <div className="space-y-2">
          {steps.map((step) => (
            <div
              key={step.label}
              className={`flex items-center gap-3 rounded-sm border p-3 ${step.done ? "border-slate-100 bg-slate-50" : "border-slate-200"}`}
            >
              {step.done ? (
                <CheckCircle2 size={20} className="text-brand-600 shrink-0" />
              ) : (
                <Circle size={20} className="text-slate-300 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${step.done ? "text-slate-400 line-through" : "text-slate-900"}`}>{step.label}</p>
                {!step.done && step.description && <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>}
              </div>
              {!step.done && (
                <Link
                  href={step.href}
                  onClick={onClose}
                  className="shrink-0 text-xs font-semibold text-brand-600 hover:underline whitespace-nowrap"
                >
                  {step.cta || "Do this "}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
