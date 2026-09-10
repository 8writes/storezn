"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { Textarea } from "@/components/ui/Textarea.js";

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
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onCancel]);

  if (!open) return null;

  const reasonMissing = requireReason && !reason.trim();

  return (
    // overflow-y-auto + py-8 on the backdrop (not just the card) means a
    // tall card - e.g. the reason textarea's mobile keyboard shrinking the
    // viewport - scrolls within the backdrop instead of getting clipped
    // off-screen with no way to reach the buttons.
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-surface rounded-sm shadow-xl w-full max-w-sm p-6 space-y-4 my-auto">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${VARIANT_ICON_CLASSES[variant]}`}>
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-sm text-slate-500 mt-1 break-words">{description}</p>}
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
          <Button variant="outline" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
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
