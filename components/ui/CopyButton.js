"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Compact inline icon-button for copying a single short value (a phone
// number, a reference code) - see CopyableUrl.js for the fuller variant
// built for a whole URL block, this is the same copy/feedback pattern
// without the surrounding chrome.
export function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable/denied - the value is still right there
      // to select and copy manually, nothing else to fall back to.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className="inline-flex items-center justify-center text-slate-400 hover:text-brand-600 cursor-pointer"
    >
      {copied ? <Check size={14} className="text-brand-600" /> : <Copy size={14} />}
    </button>
  );
}
