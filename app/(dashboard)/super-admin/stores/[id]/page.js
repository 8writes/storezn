"use client";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";

export default function SuperAdminStoreDetailPage({ params }) {
  const { id } = use(params);
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [store, setStore] = useState(null);
  const [owner, setOwner] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [rateOverride, setRateOverride] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/v1/super-admin/stores/${id}`)
      .then((data) => {
        setStore(data.store);
        setOwner(data.owner);
        setTransactions(data.transactions);
        setRateOverride(data.store.commissionRatePercent != null ? String(data.store.commissionRatePercent) : "");
      })
      .catch((err) => toast.error(err.message || "Failed to load store"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  const saveRate = async () => {
    setSaving(true);
    try {
      const data = await apiFetch(`/api/v1/super-admin/stores/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ commissionRatePercent: rateOverride === "" ? null : Number(rateOverride) }),
      });
      setStore(data.store);
      toast.success("Commission rate updated");
    } catch (err) {
      toast.error(err.message || "Failed to update rate");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (store.isActive) {
      const ok = await confirm({
        title: `Disable ${store.name}?`,
        description: "The vendor won't be able to log in or manage this store until you re-enable it.",
        confirmLabel: "Disable",
        variant: "danger",
      });
      if (!ok) return;
    }
    setToggling(true);
    try {
      const data = await apiFetch(`/api/v1/super-admin/stores/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !store.isActive }),
      });
      setStore(data.store);
      toast.success(data.store.isActive ? "Store enabled" : "Store disabled");
    } catch (err) {
      toast.error(err.message || "Failed to update store");
    } finally {
      setToggling(false);
    }
  };

  const unlockPayoutAccount = async () => {
    const ok = await confirm({
      title: "Unlock payout account?",
      description: "Clears the vendor's linked bank account so they can link a new one. Only do this after verifying the request with the vendor directly.",
      confirmLabel: "Unlock",
      variant: "danger",
    });
    if (!ok) return;
    setUnlocking(true);
    try {
      const data = await apiFetch(`/api/v1/super-admin/stores/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ unlockPayoutAccount: true }),
      });
      setStore(data.store);
      toast.success("Payout account unlocked - the vendor can now link a new one");
    } catch (err) {
      toast.error(err.message || "Failed to unlock payout account");
    } finally {
      setUnlocking(false);
    }
  };

  if (loading || !store) {
    return (
      <div className="space-y-6">
        <BackLink href="/super-admin/stores" label="Back to stores" />
        <FormSkeleton fields={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink href="/super-admin/stores" label="Back to stores" />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{store.name}</h1>
          <p className="text-sm text-slate-500">{store.slug}.storezn.com.com</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge color={store.isActive ? "green" : "red"}>{store.isActive ? "Active" : "Inactive"}</Badge>
          <Badge color={store.isOpen ? "green" : "slate"}>{store.isOpen ? "Open" : "Closed by vendor"}</Badge>
          <Button size="sm" variant={store.isActive ? "danger" : "primary"} onClick={toggleActive} loading={toggling}>
            {store.isActive ? "Disable store" : "Enable store"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Vendor contact</p>
          {owner ? (
            <>
              <p className="text-sm text-slate-900">{owner.firstName} {owner.lastName}</p>
              <p className="text-sm text-slate-500">{owner.email}</p>
              {owner.phone && <p className="text-sm text-slate-500">{owner.phone}</p>}
            </>
          ) : (
            <p className="text-sm text-slate-400">No owner on record</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Store details</p>
          <p className="text-sm text-slate-500">Currency: {store.currency}</p>
          <p className="text-sm text-slate-500">Custom domain: {store.customDomain || "not set"} ({store.domainStatus})</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-5 max-w-md space-y-3">
        <p className="text-sm font-semibold text-slate-700">Payout account</p>
        {store.subAccountCode ? (
          <>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Bank</dt>
                <dd className="text-slate-900 font-medium">{store.bankName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Account number</dt>
                <dd className="text-slate-900 font-medium">{store.accountNumber}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Account name</dt>
                <dd className="text-slate-900 font-medium">{store.accountName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Paystack sub-account</dt>
                <dd className="text-slate-900 font-medium font-mono text-xs">{store.subAccountCode}</dd>
              </div>
            </dl>
            <p className="text-xs text-slate-500">
              This is locked on the vendor&apos;s side once set. Only unlock it after verifying the change with the vendor directly.
            </p>
            <Button size="sm" variant="danger" onClick={unlockPayoutAccount} loading={unlocking}>
              Unlock payout account
            </Button>
          </>
        ) : (
          <p className="text-sm text-slate-400">Not yet configured.</p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-5 max-w-md space-y-3">
        <p className="text-sm font-semibold text-slate-700">Custom commission rate</p>
        <p className="text-xs text-slate-500">Leave blank to use the platform default rate.</p>
        <div className="flex items-end gap-3">
          <Input label="Commission rate (%)" type="number" min="0" max="100" step="0.1" value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} className="flex-1" />
          <Button onClick={saveRate} loading={saving}>Save</Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">Transactions</p>
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-400">No transactions yet.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Commission</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{formatDateTime(t.createdAt)}</td>
                    <td className="px-4 py-3">{formatCurrency(t.amount)}</td>
                    <td className="px-4 py-3">{formatCurrency(t.commission)}</td>
                    <td className="px-4 py-3">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
