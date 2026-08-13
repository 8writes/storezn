"use client";
import { useState } from "react";
import { Copy, Check, ExternalLink, Share2 } from "lucide-react";

// A URL shown plainly (not hidden behind a link label) with one click to
// copy and one to open - for anything a vendor needs to hand off
// verbatim (their storefront link, mainly), where "click here" text
// alone makes the actual URL invisible/hard to grab. The "Copy link"
// button is spelled out in words, not just an icon - vendors kept asking
// where customers actually see their store, and a bare clipboard glyph
// was easy to miss as "the answer" to that question.
export function CopyableUrl({ url, shareTitle }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

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

  const handleShare = () => {
    navigator.share({ title: shareTitle, url }).catch(() => {});
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-sm pl-3 pr-2 py-2">
        <a href={url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-sm text-slate-700 truncate hover:text-brand-700">
          {url}
        </a>
        <a href={url} target="_blank" rel="noreferrer" aria-label="Open storefront" className="shrink-0 p-1.5 text-slate-700 hover:text-slate-700">
          <ExternalLink size={16} />
        </a>
      </div>
      <div className={canShare ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-brand-600 text-white px-3 py-2 rounded-sm hover:bg-brand-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copied!" : "Copy link"}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-sm hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Share2 size={16} />
            Share
          </button>
        )}
      </div>
    </div>
  );
}
