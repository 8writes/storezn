"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { Textarea } from "@/components/ui/Textarea.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";

const VARIANT_ICON_CLASSES = {
  danger: "bg-red-100 text-red-600",
  brand: "bg-brand-100 text-brand-700",
};

// Low-level, controlled confirmation dialog. Most call sites should use
// the `useConfirm()` hook instead of rendering this directly - it handles
// open/close state and turns "confirm" into an awaitable call.
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "brand",
  loading = false,
  requireReason = false,
  reasonLabel = "Reason",
  storefront = false,
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState("");
  useModalScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setReason("");
      onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onCancel]);

  if (!open) return null;

  const reasonMissing = requireReason && !reason.trim();
  const cancel = () => {
    setReason("");
    onCancel();
  };
  const submit = () => {
    const value = requireReason ? reason.trim() : undefined;
    setReason("");
    onConfirm(value);
  };

  return (
    // overflow-y-auto + py-8 on the backdrop (not just the card) means a
    // tall card - e.g. the reason textarea's mobile keyboard shrinking the
    // viewport - scrolls within the backdrop instead of getting clipped
    // off-screen with no way to reach the buttons.
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain p-4 py-8">
      <div className={`fixed inset-0 ${storefront ? "bg-brand-900/55" : "bg-black/50"}`} onClick={cancel} />
      <div className={`relative rounded-sm shadow-xl w-full max-w-sm p-6 space-y-4 my-auto ${storefront ? "bg-white border border-brand-200 border-t-4 border-t-brand-600" : "bg-surface"}`}>
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${VARIANT_ICON_CLASSES[variant]}`}>
            {storefront ? <Send size={17} /> : <AlertTriangle size={18} />}
          </div>
          <div className="min-w-0">
            <h2 className={`font-semibold ${storefront ? "text-brand-900" : "text-slate-900"}`}>{title}</h2>
            {description && <p className="text-sm text-slate-800 mt-1 break-words">{description}</p>}
          </div>
        </div>

        {requireReason && (
          <Textarea
            label={reasonLabel}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="outline" onClick={cancel} disabled={loading}>{cancelLabel}</Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={submit}
            loading={loading}
            disabled={reasonMissing}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
