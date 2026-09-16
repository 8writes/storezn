"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Database, ExternalLink, Trash2 } from "lucide-react";
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
  const [plusPrice, setPlusPrice] = useState("");
  const [freeStorageMb, setFreeStorageMb] = useState("");
  const [plusStorageMb, setPlusStorageMb] = useState("");
  const [freeStaffLimit, setFreeStaffLimit] = useState("");
  const [plusStaffLimit, setPlusStaffLimit] = useState("");
  const [freeBranchLimit, setFreeBranchLimit] = useState("");
  const [plusBranchLimit, setPlusBranchLimit] = useState("");
  const [databaseAccess, setDatabaseAccess] = useState(null);
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
        setPlusPrice(String(data.settings.plusMonthlyPrice ?? 5000));
        setFreeStorageMb(String(data.settings.freeStorageMb ?? 500));
        setPlusStorageMb(String(data.settings.plusStorageMb ?? 5000));
        setFreeStaffLimit(String(data.settings.freeStaffLimit ?? 1));
        setPlusStaffLimit(String(data.settings.plusStaffLimit ?? 10));
        setFreeBranchLimit(String(data.settings.freeBranchLimit ?? 1));
        setPlusBranchLimit(String(data.settings.plusBranchLimit ?? 5));
        setDatabaseAccess(data.databaseAccess || null);
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
          plusMonthlyPrice: Number(plusPrice),
          freeStorageMb: Number(freeStorageMb),
          plusStorageMb: Number(plusStorageMb),
          freeStaffLimit: Number(freeStaffLimit),
          plusStaffLimit: Number(plusStaffLimit),
          freeBranchLimit: Number(freeBranchLimit),
          plusBranchLimit: Number(plusBranchLimit),
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
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-slate-900">Platform settings</h1>

      <PushNotificationToggle token={token} />

      <BlockedEmails token={token} />

      {loading ? (
        <FormSkeleton fields={2} />
      ) : (
        <>
          <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-3">
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
                  className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
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

          <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Database size={18} className="text-slate-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">Database access</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Open pgAdmin for the production database. Passwords stay server-side and are not shown here.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!databaseAccess?.configured}
                onClick={() => window.open(databaseAccess.pgAdminUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink size={14} />
                Open pgAdmin
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-sm border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="block text-slate-500">Host</span>
                <span className="font-medium text-slate-800 break-all">{databaseAccess?.host || "-"}</span>
              </div>
              <div className="rounded-sm border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="block text-slate-500">Database</span>
                <span className="font-medium text-slate-800 break-all">{databaseAccess?.database || "-"}</span>
              </div>
              <div className="rounded-sm border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="block text-slate-500">Port</span>
                <span className="font-medium text-slate-800">{databaseAccess?.port || "-"}</span>
              </div>
              <div className="rounded-sm border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="block text-slate-500">User</span>
                <span className="font-medium text-slate-800 break-all">{databaseAccess?.username || "-"}</span>
              </div>
            </div>
            {!databaseAccess?.configured && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
                Set PGADMIN_URL on the server to enable this button.
              </p>
            )}
          </div>

          <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">Commission</p>
            <p className="text-xs text-slate-500 mt-1">
              Default cut the platform takes from every sale, deducted automatically at checkout via split payment.
              Individual stores can get a custom rate from their store page.
            </p>
          </div>
          <Input label="Default commission rate (%)" type="number" min="0" max="100" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
          <div>
            <Input label="Platform fee cap (₦ per order, optional)" type="number" min="0" step="1" placeholder="No cap" value={cap} onChange={(e) => setCap(e.target.value)} />
            <p className="text-xs text-slate-500 mt-1">
              The platform never takes more than this per order in total - commission plus the flat fee below combined, regardless of the rate above or the order&apos;s subtotal. The flat fee always stays intact; the percentage commission is what shrinks to fit under the cap. Leave blank for no cap.
            </p>
          </div>
          <div>
            <Input label="Flat fee (₦ per order)" type="number" min="0" step="1" value={flatFee} onChange={(e) => setFlatFee(e.target.value)} />
            <p className="text-xs text-slate-500 mt-1">
              A fixed amount charged on every order on top of the commission above. Counts toward the cap above (which the commission makes room for), 0 disables it.
            </p>
          </div>
          <Button onClick={save} loading={saving}>Save</Button>
          </div>

          <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-700">Storezn+</p>
              <p className="text-xs text-slate-500 mt-1">
                Pricing and limits for the Storezn+ paid tier (offline orders, storefront theme color, higher staff and storage limits).
              </p>
            </div>
            <Input label="Storezn+ monthly price (₦)" type="number" min="0" step="1" value={plusPrice} onChange={(e) => setPlusPrice(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Free plan storage (MB)" type="number" min="0" step="1" value={freeStorageMb} onChange={(e) => setFreeStorageMb(e.target.value)} />
              <Input label="Storezn+ storage (MB)" type="number" min="0" step="1" value={plusStorageMb} onChange={(e) => setPlusStorageMb(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Free plan staff limit" type="number" min="0" step="1" value={freeStaffLimit} onChange={(e) => setFreeStaffLimit(e.target.value)} />
              <Input label="Storezn+ staff limit" type="number" min="0" step="1" value={plusStaffLimit} onChange={(e) => setPlusStaffLimit(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Free plan branch limit" type="number" min="1" step="1" value={freeBranchLimit} onChange={(e) => setFreeBranchLimit(e.target.value)} />
              <Input label="Storezn+ branch limit" type="number" min="1" step="1" value={plusBranchLimit} onChange={(e) => setPlusBranchLimit(e.target.value)} />
            </div>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </>
      )}
    </div>
  );
}

// Signup block-list - emails / domains that are outright rejected at
// signup (customer and vendor). Its own fetch so it isn't tied to the
// settings form's loading state.
function BlockedEmails({ token }) {
  const { apiFetch } = useApi(token);
  const [rows, setRows] = useState(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/super-admin/blocked-emails")
      .then((d) => setRows(d.blocked))
      .catch(() => setRows([]));
  }, [token, apiFetch]);

  const add = async () => {
    if (!value.trim()) return;
    setAdding(true);
    try {
      const d = await apiFetch("/api/v1/super-admin/blocked-emails", {
        method: "POST",
        body: JSON.stringify({ value: value.trim(), reason: reason.trim() || undefined }),
      });
      setRows((r) => [d.blocked, ...(r || [])]);
      setValue("");
      setReason("");
      toast.success("Added to the block-list");
    } catch (err) {
      toast.error(err.message || "Couldn't add that");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    try {
      await apiFetch(`/api/v1/super-admin/blocked-emails/${id}`, { method: "DELETE" });
      setRows((r) => (r || []).filter((x) => x.id !== id));
    } catch (err) {
      toast.error(err.message || "Couldn't remove that");
    }
  };

  return (
    <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">Blocked signup emails</p>
        <p className="text-xs text-slate-500 mt-1">
          An <span className="font-medium">email</span> (blocks that mailbox and all its <code>+tag</code> aliases) or a bare{" "}
          <span className="font-medium">domain</span> like <code>mailinator.com</code> (blocks the whole domain). Applies to
          customer and vendor signup.
        </p>
      </div>
      <div className="flex items-end gap-2">
        <Input
          label="Email or domain"
          placeholder="spammer@gmail.com  or  tempmail.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1"
        />
        <Button onClick={add} loading={adding} disabled={!value.trim()}>Add</Button>
      </div>
      <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />

      {rows === null ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">Nothing blocked.</p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-sm">
          {rows.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-slate-800 break-all">{b.value}</span>
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">{b.kind}</span>
                {b.reason && <span className="block text-xs text-slate-500 truncate">{b.reason}</span>}
              </span>
              <button type="button" onClick={() => remove(b.id)} className="text-slate-400 hover:text-red-600 shrink-0" title="Remove">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
