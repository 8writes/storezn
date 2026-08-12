"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Share2, Check, Copy } from "lucide-react";

// Native share sheet where available (mobile browsers, mainly - exactly
// where a shopper is most likely to want to send a product to someone on
// WhatsApp), falling back to copy-to-clipboard + a toast everywhere else
// (desktop browsers largely don't implement navigator.share).
export function ShareButton({ url, title, className = "" }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  const handleClick = async () => {
    if (canShare) {
      navigator.share({ title, url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors cursor-pointer ${className}`}
    >
      {copied ? <Check size={16} className="text-green-600" /> : canShare ? <Share2 size={16} /> : <Copy size={16} />}
      Share
    </button>
  );
}
