"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Globe, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";

const STATUS_BADGE = {
  none: null,
  pending_dns: { color: "amber", label: "Awaiting DNS" },
  verified: { color: "green", label: "Verified" },
};

// SERVER_IP is public by nature (it's the address every vendor points
// their domain's A record at) - safe as NEXT_PUBLIC_, unlike the DB/
// storage credentials elsewhere in this app's env.
const SERVER_IP = process.env.NEXT_PUBLIC_SERVER_IP;

export function CustomDomainSettings({ store, isPlus, apiFetch, storeId, onUpdated }) {
  const [value, setValue] = useState(store.customDomain || "");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const badge = STATUS_BADGE[store.domainStatus];

  // A store that already had a domain linked before this became a Plus
  // feature (or downgraded since) keeps seeing its own status/verify UI
  // below - only the "link a new domain" form is what's actually gated.
  if (!isPlus && !store.customDomain) {
    return (
      <div className="bg-white border border-dashed border-slate-300 rounded-sm p-5 max-w-md space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">Custom domain</p>
          <Badge color="slate">Storezn+</Badge>
        </div>
        <p className="text-xs text-slate-500">
          Use your own domain instead of {`{slug}`}.storezn.com - part of Storezn+.
        </p>
        <Link href="/vendor/plus" className="inline-block text-xs font-semibold text-brand-600 hover:text-brand-700">
          Upgrade to Storezn+
        </Link>
      </div>
    );
  }

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/domain`, {
        method: "POST",
        body: JSON.stringify({ customDomain: value.trim() || null }),
      });
      onUpdated(data.store);
      toast.success(value.trim() ? "Domain saved - point its DNS at the address below, then verify" : "Custom domain removed");
    } catch (err) {
      toast.error(err.message || "Failed to save domain");
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/domain/verify`, { method: "POST" });
      onUpdated(data.store);
      toast.success("Domain verified - it's live");
    } catch (err) {
      toast.error(err.message || "Not verified yet");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-sm p-5 max-w-md space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">Custom domain</p>
          <p className="text-xs text-slate-500 mt-1">Use your own domain instead of {`{slug}`}.storezn.com.</p>
        </div>
        {badge && <Badge color={badge.color}>{badge.label}</Badge>}
      </div>

      <form onSubmit={save} className="flex items-end gap-2">
        <Input
          label="Domain"
          placeholder="example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" loading={saving} size="sm">Save</Button>
      </form>

      {store.customDomain && store.domainStatus !== "verified" && SERVER_IP && (
        <div className="bg-slate-50 border border-slate-200 rounded-sm p-3 text-xs text-slate-600 space-y-2">
          <p className="flex items-center gap-1.5 font-medium text-slate-700">
            <Globe size={13} />
            At your domain registrar, add an A record:
          </p>
          <p className="font-mono bg-white border border-slate-200 rounded px-2 py-1.5">
            {store.customDomain}  →  A  →  {SERVER_IP}
          </p>
          <p>DNS changes can take a few minutes to a day to take effect.</p>
          <Button type="button" variant="outline" size="sm" onClick={verify} loading={verifying}>
            <RefreshCw size={13} />
            Verify now
          </Button>
        </div>
      )}

      {store.domainStatus === "verified" && (
        <p className="text-xs text-slate-500">
          Your store is live at{" "}
          <a href={`https://${store.customDomain}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
            {store.customDomain}
          </a>
          .
        </p>
      )}
    </div>
  );
}
