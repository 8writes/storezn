"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/Button.js";
import { generateStoreQrCard } from "@/lib/generateStoreQrCard.js";

// Opens a preview of the downloadable "shop online" QR card and lets the
// vendor save it as a PNG - the actual composition (logo, store name, QR
// code) lives in lib/generateStoreQrCard.js so this component just
// handles the modal chrome and the download trigger.
export function StoreQrCodeButton({ storeName, storeUrl }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <QrCode size={16} />
        Get QR code
      </Button>

      {open && <QrModal storeName={storeName} storeUrl={storeUrl} onClose={() => setOpen(false)} />}
    </>
  );
}

// Mounted only while the modal is open, so "generating" starts true from
// this component's own initial state instead of needing an effect to
// flip it on open - unmounting on close then remounting on next open
// resets everything for free.
function QrModal({ storeName, storeUrl, onClose }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [canvas, setCanvas] = useState(null);
  const [generating, setGenerating] = useState(true);

  useEffect(() => {
    generateStoreQrCard({ storeName, storeUrl })
      .then((c) => {
        setCanvas(c);
        setPreviewUrl(c.toDataURL("image/png"));
      })
      .catch(() => toast.error("Couldn't generate the QR code"))
      .finally(() => setGenerating(false));
  }, [storeName, storeUrl]);

  const handleDownload = () => {
    if (!canvas) return;
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-qr-code.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 py-8">
      <div className="fixed inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-white rounded-sm shadow-xl w-full max-w-sm overflow-hidden my-auto">
        <div className="flex items-center justify-between px-4 h-12 border-b border-slate-200">
          <span className="text-sm font-semibold text-slate-900">Your storefront QR code</span>
          <button type="button" onClick={onClose} className="cursor-pointer text-slate-700 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-center bg-slate-50 rounded-sm border border-slate-200 p-3 min-h-64">
            {generating ? <div className="spinner" /> : previewUrl && <img src={previewUrl} alt="Storefront QR code" className="w-full rounded-sm" />}
          </div>
          <p className="text-xs text-slate-500">
            Print this on packaging, flyers, or your storefront - scanning it takes customers straight to your store.
          </p>
          <Button type="button" onClick={handleDownload} disabled={!canvas} fullWidth>
            <Download size={16} />
            Download PNG
          </Button>
        </div>
      </div>
    </div>
  );
}
