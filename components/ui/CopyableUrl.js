"use client";
import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

// A URL shown plainly (not hidden behind a link label) with one click to
// copy and one to open - for anything a vendor needs to hand off
// verbatim (their storefront link, mainly), where "click here" text
// alone makes the actual URL invisible/hard to grab.
export function CopyableUrl({ url }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable/denied - the URL is still right there
      // to select and copy manually, nothing else to fall back to.
    }
  };

  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-sm pl-3 pr-2 py-2">
      <a href={url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-sm text-slate-700 truncate hover:text-brand-700">
        {url}
      </a>
      <button type="button" onClick={handleCopy} aria-label="Copy link" className="shrink-0 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer">
        {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
      </button>
      <a href={url} target="_blank" rel="noreferrer" aria-label="Open storefront" className="shrink-0 p-1.5 text-slate-400 hover:text-slate-700">
        <ExternalLink size={16} />
      </a>
    </div>
  );
}
