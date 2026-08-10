"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";

export default function SuperAdminSettingsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [rate, setRate] = useState("");
  const [cap, setCap] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/super-admin/settings")
      .then((data) => {
        setRate(String(data.settings.defaultCommissionRatePercent));
        setCap(data.settings.maxCommissionAmount != null ? String(data.settings.maxCommissionAmount) : "");
      })
      .catch((err) => toast.error(err.message || "Failed to load settings"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/v1/super-admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          defaultCommissionRatePercent: Number(rate),
          maxCommissionAmount: cap.trim() === "" ? null : Number(cap),
        }),
      });
      toast.success("Platform settings saved");
    } catch (err) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Platform settings</h1>

      {loading ? (
        <FormSkeleton fields={2} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm p-5 max-w-md space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">Commission</p>
            <p className="text-xs text-slate-500 mt-1">
              Default cut the platform takes from every sale, deducted automatically at checkout via split payment.
              Individual stores can get a custom rate from their store page.
            </p>
          </div>
          <Input label="Default commission rate (%)" type="number" min="0" max="100" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
          <div>
            <Input label="Commission cap (₦ per order, optional)" type="number" min="0" step="1" placeholder="No cap" value={cap} onChange={(e) => setCap(e.target.value)} />
            <p className="text-xs text-slate-500 mt-1">
              The commission never charges more than this per order, regardless of the rate above or the order&apos;s subtotal. Leave blank for no cap.
            </p>
          </div>
          <Button onClick={save} loading={saving}>Save</Button>
        </div>
      )}
    </div>
  );
}
