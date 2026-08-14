"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { PushNotificationToggle } from "@/components/ui/PushNotificationToggle.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";

export default function SuperAdminSettingsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [rate, setRate] = useState("");
  const [cap, setCap] = useState("");
  const [flatFee, setFlatFee] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingMaintenance, setTogglingMaintenance] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/super-admin/settings")
      .then((data) => {
        setRate(String(data.settings.defaultCommissionRatePercent));
        setCap(data.settings.maxCommissionAmount != null ? String(data.settings.maxCommissionAmount) : "");
        setFlatFee(String(data.settings.defaultFlatFee ?? 0));
        setMaintenanceMode(!!data.settings.maintenanceMode);
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
          defaultFlatFee: flatFee.trim() === "" ? 0 : Number(flatFee),
        }),
      });
      toast.success("Platform settings saved");
    } catch (err) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleMaintenance = async () => {
    setTogglingMaintenance(true);
    try {
      const data = await apiFetch("/api/v1/super-admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ maintenanceMode: !maintenanceMode }),
      });
      setMaintenanceMode(!!data.settings.maintenanceMode);
      toast.success(data.settings.maintenanceMode ? "Maintenance mode is on" : "Maintenance mode is off");
    } catch (err) {
      toast.error(err.message || "Failed to update maintenance mode");
    } finally {
      setTogglingMaintenance(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Platform settings</h1>

      <PushNotificationToggle token={token} />

      {loading ? (
        <FormSkeleton fields={2} />
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-sm p-5 max-w-md space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-700">Maintenance mode</p>
                <p className="text-xs text-slate-500 mt-1">
                  Shows every visitor a &quot;we&apos;ll be back soon&quot; page instead of the app - storefronts, vendor dashboard, customer sign-in.
                  Super-admin and login stay reachable so you can turn this back off.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={maintenanceMode}
                aria-label="Toggle maintenance mode"
                disabled={togglingMaintenance}
                onClick={toggleMaintenance}
                className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  maintenanceMode ? "bg-red-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    maintenanceMode ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {maintenanceMode && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-sm p-3 text-xs text-red-800">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>Maintenance mode is currently on. The live site is showing the maintenance page to everyone but super-admins.</p>
              </div>
            )}
          </div>

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
          <div>
            <Input label="Flat fee (₦ per order)" type="number" min="0" step="1" value={flatFee} onChange={(e) => setFlatFee(e.target.value)} />
            <p className="text-xs text-slate-500 mt-1">
              A fixed amount charged on every order on top of the commission above - not capped by the commission cap, since it's already a fixed amount. 0 disables it.
            </p>
          </div>
          <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </>
      )}
    </div>
  );
}
