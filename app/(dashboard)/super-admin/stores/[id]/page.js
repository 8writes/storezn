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
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format.js";
import { getEffectivePlan } from "@/lib/storePlan.js";

export default function SuperAdminStoreDetailPage({ params }) {
  const { id } = use(params);
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [store, setStore] = useState(null);
  const [owner, setOwner] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [subTx, setSubTx] = useState([]);
  const [rateOverride, setRateOverride] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [plusForm, setPlusForm] = useState({ amount: "", months: "1", paidAt: "", note: "" });
  const [activatingPlus, setActivatingPlus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch(`/api/v1/super-admin/stores/${id}`)
      .then((data) => {
        setStore(data.store);
        setOwner(data.owner);
        setTransactions(data.transactions);
        setSubTx(data.subscriptionTransactions || []);
        setRateOverride(data.store.commissionRatePercent != null ? String(data.store.commissionRatePercent) : "");
        setPriceOverride(data.store.subscriptionPriceOverride != null ? String(data.store.subscriptionPriceOverride) : "");
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

  const savePrice = async () => {
    setSavingPrice(true);
    try {
      const data = await apiFetch(`/api/v1/super-admin/stores/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ subscriptionPriceOverride: priceOverride === "" ? null : Number(priceOverride) }),
      });
      setStore(data.store);
      toast.success("Subscription price updated");
    } catch (err) {
      toast.error(err.message || "Failed to update price");
    } finally {
      setSavingPrice(false);
    }
  };

  const activatePlus = async () => {
    if (!plusForm.amount || Number(plusForm.amount) <= 0) {
      toast.error("Enter the amount they paid");
      return;
    }
    const months = Number(plusForm.months) || 1;
    const ok = await confirm({
      title: `Activate Storezn+ for ${store.name}?`,
      description: `Records ${formatCurrency(Number(plusForm.amount))} as an off-platform payment and grants Storezn+ for ${months} month${months === 1 ? "" : "s"}${
        getEffectivePlan(store) === "plus" ? " on top of the time already left" : ""
      }. It won't auto-renew.`,
      confirmLabel: "Activate",
    });
    if (!ok) return;
    setActivatingPlus(true);
    try {
      const body = { amount: Number(plusForm.amount), months };
      if (plusForm.paidAt) body.paidAt = plusForm.paidAt;
      if (plusForm.note.trim()) body.note = plusForm.note.trim();
      const data = await apiFetch(`/api/v1/super-admin/stores/${id}/manual-plus`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setStore(data.store);
      setPlusForm({ amount: "", months: "1", paidAt: "", note: "" });
      toast.success(`Storezn+ active until ${formatDate(data.planRenewsAt)}`);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to activate Storezn+");
    } finally {
      setActivatingPlus(false);
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
            <p className="text-sm text-slate-700">No owner on record</p>
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
          <p className="text-sm text-slate-700">Not yet configured.</p>
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

      <div className="bg-white border border-slate-200 rounded-sm p-5 max-w-md space-y-3">
        <p className="text-sm font-semibold text-slate-700">Custom Storezn+ price</p>
        <p className="text-xs text-slate-500">Leave blank to use the platform default price. Only applies the next time this store subscribes - doesn&apos;t change an already-active subscription&apos;s charge.</p>
        <div className="flex items-end gap-3">
          <Input label="Monthly price" type="number" min="0" step="1" value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)} className="flex-1" />
          <Button onClick={savePrice} loading={savingPrice}>Save</Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-5 max-w-md space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">Storezn+ (offline payment)</p>
          <Badge color={getEffectivePlan(store) === "plus" ? "green" : "slate"}>
            {getEffectivePlan(store) === "plus" ? "Plus" : "Free"}
          </Badge>
        </div>
        <p className="text-xs text-slate-500">
          {getEffectivePlan(store) === "plus"
            ? `Active until ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "-"}${store.planCancelled ? " - won't auto-renew" : " - renews via Paystack"}.`
            : "This store is on the free plan."}
          {" "}Use this when a business pays you directly (transfer/cash). The amount is
          logged to subscription revenue and Plus is granted for the months you enter,
          stacking on any time already left. It won&apos;t auto-renew.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Amount paid (₦)"
            type="number"
            min="0"
            step="1"
            value={plusForm.amount}
            onChange={(e) => setPlusForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <Input
            label="Months"
            type="number"
            min="1"
            max="36"
            value={plusForm.months}
            onChange={(e) => setPlusForm((f) => ({ ...f, months: e.target.value }))}
          />
          <Input
            label="Paid on (optional)"
            type="date"
            value={plusForm.paidAt}
            onChange={(e) => setPlusForm((f) => ({ ...f, paidAt: e.target.value }))}
          />
          <Input
            label="Note (optional)"
            value={plusForm.note}
            onChange={(e) => setPlusForm((f) => ({ ...f, note: e.target.value }))}
          />
        </div>
        <Button onClick={activatePlus} loading={activatingPlus} fullWidth>
          {getEffectivePlan(store) === "plus" ? "Extend Storezn+" : "Activate Storezn+"}
        </Button>

        {subTx.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-medium text-slate-500 mb-1.5">Storezn+ payments</p>
            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-sm">
              {subTx.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="text-slate-500">{formatDate(s.paidAt)}</span>
                  <span className="text-slate-900 font-medium">{formatCurrency(s.amount)}</span>
                  <Badge color={s.manual ? "amber" : "slate"}>{s.manual ? "Offline" : "Paystack"}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">Transactions</p>
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-700">No transactions yet.</p>
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
