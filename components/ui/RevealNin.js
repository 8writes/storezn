"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

// NIN is stored encrypted at rest - the list endpoint this renders next
// to never returns it, only whether one exists (hasNin). This fetches
// and decrypts it lazily, one row at a time, only when an admin actually
// clicks to see it.
export function RevealNin({ hasNin, apiFetch, endpoint }) {
  const [nin, setNin] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!hasNin) return <span className="text-slate-400">-</span>;

  if (nin) {
    return (
      <span className="font-mono inline-flex items-center gap-2">
        {nin}
        <button type="button" onClick={() => setNin(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer" title="Hide">
          <EyeOff size={14} />
        </button>
      </span>
    );
  }

  const reveal = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(endpoint);
      setNin(data.nin);
    } catch (err) {
      toast.error(err.message || "Failed to reveal NIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={reveal}
      className="inline-flex items-center gap-1.5 text-slate-500 hover:text-brand-600 cursor-pointer disabled:opacity-50"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
      Reveal
    </button>
  );
}
