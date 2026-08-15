"use client";
import { useEffect } from "react";
import Link from "next/link";
import { HardDrive } from "lucide-react";
import { Button } from "@/components/ui/Button.js";

// Shown whenever an upload is rejected with 402 "storage limit reached"
// (see POST /api/v1/uploads/file) - offers the two real ways out instead
// of just a toast: upgrade for more room, or free some up by removing a
// product's photos. Same chrome as ConfirmModal.js.
export function StorageLimitDialog({ open, onClose }) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-sm shadow-xl w-full max-w-sm p-6 space-y-4 my-auto">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-red-100 text-red-600">
            <HardDrive size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">Storage limit reached</h2>
            <p className="text-sm text-slate-500 mt-1">
              You&apos;re out of image storage. Upgrade to Storezn+ for more space, or remove some photos from
              existing products to free some up.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <Link href="/vendor/plus" className="w-full">
            <Button fullWidth onClick={onClose}>Upgrade to Storezn+</Button>
          </Link>
          <Link href="/vendor/products" className="w-full">
            <Button variant="outline" fullWidth onClick={onClose}>Manage products</Button>
          </Link>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 cursor-pointer pt-1">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
