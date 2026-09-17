"use client";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { BackLink } from "@/components/ui/BackLink.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format.js";
import { getEffectivePlan } from "@/lib/storePlan.js";

// action -> {label, color} for the activity chip (mirrors /vendor/activity).
const KIND = {
  "pos.sale": { label: "Sale", color: "green" },
  "pos.sale.adjusted": { label: "Sale (adjusted)", color: "amber" },
  "pos.return": { label: "Return", color: "red" },
  "order.manual": { label: "Past sale", color: "blue" },
  "cash.paid_in": { label: "Paid in", color: "green" },
  "cash.paid_out": { label: "Paid out", color: "amber" },
  "cash.drop": { label: "Cash drop", color: "slate" },
  "register.open": { label: "Register open", color: "blue" },
  "register.close": { label: "Register close", color: "slate" },
  "stock.adjust": { label: "Stock", color: "blue" },
  "product.create": { label: "Product added", color: "green" },
  "product.update": { label: "Product edit", color: "amber" },
  "product.delete": { label: "Product deleted", color: "red" },
  "staff.add": { label: "Staff added", color: "green" },
  "staff.remove": { label: "Staff removed", color: "red" },
  "staff.branch": { label: "Staff branch", color: "blue" },
};

const ADMIN_ACTION_LABEL = {
  "store.update": "Store settings changed",
  "store.manual_plus": "Plan granted (offline payment)",
  "store.enable": "Store enabled",
  "store.disable": "Store disabled",
};

function Metric({ label, value, sub }) {
  return (
    <div className="rounded-sm border border-slate-200 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-800 font-semibold">{label}</p>
      <p className="text-lg font-bold text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-800">{sub}</p>}
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-800">{label}</dt>
      <dd className="text-slate-900 font-medium text-right">{children}</dd>
    </div>
  );
}

export default function SuperAdminStoreDetailPage({ params }) {
  const { id } = use(params);
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [store, setStore] = useState(null);
  const [owner, setOwner] = useState(null);
  const [stats, setStats] = useState(null);
  const [storeActivity, setStoreActivity] = useState([]);
  const [adminActivity, setAdminActivity] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [subTx, setSubTx] = useState([]);
  const [rateOverride, setRateOverride] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [plusForm, setPlusForm] = useState({ amount: "", months: "1", plan: "plus", paidAt: "", note: "" });
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
        setStats(data.stats || null);
        setStoreActivity(data.storeActivity || []);
        setAdminActivity(data.adminActivity || []);
        setTransactions(data.transactions);
        setSubTx(data.subscriptionTransactions || []);
        setRateOverride(data.store.commissionRatePercent != null ? String(data.store.commissionRatePercent) : "");
        setPriceOverride(data.store.subscriptionPriceOverride != null ? String(data.store.subscriptionPriceOverride) : "");
      })
      .catch((err) => toast.error(err.message || "Failed to load store"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // load() starts the asynchronous page request and owns loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    const planName = plusForm.plan === "enterprise" ? "Storezn Enterprise" : "Storezn+";
    const alreadyOnThis = getEffectivePlan(store) === plusForm.plan;
    const ok = await confirm({
      title: `Activate ${planName} for ${store.name}?`,
      description: `Records ${formatCurrency(Number(plusForm.amount))} as an off-platform payment and grants ${planName} for ${months} month${months === 1 ? "" : "s"}${
        alreadyOnThis ? " on top of the time already left" : ""
      }. It won't auto-renew.`,
      confirmLabel: "Activate",
    });
    if (!ok) return;
    setActivatingPlus(true);
    try {
      const body = { amount: Number(plusForm.amount), months, plan: plusForm.plan };
      if (plusForm.paidAt) body.paidAt = plusForm.paidAt;
      if (plusForm.note.trim()) body.note = plusForm.note.trim();
      const data = await apiFetch(`/api/v1/super-admin/stores/${id}/manual-plus`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setStore(data.store);
      setPlusForm({ amount: "", months: "1", plan: "plus", paidAt: "", note: "" });
      toast.success(`${planName} active until ${formatDate(data.planRenewsAt)}`);
      load();
    } catch (err) {
      toast.error(err.message || `Failed to activate ${planName}`);
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
          <p className="text-sm text-slate-800">{store.slug}.storezn.com</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge color={getEffectivePlan(store) === "free" ? "slate" : getEffectivePlan(store) === "enterprise" ? "blue" : "green"}>
            {getEffectivePlan(store) === "enterprise" ? "Enterprise" : getEffectivePlan(store) === "plus" ? "Plus" : "Free"}
          </Badge>
          <Badge color={store.isActive ? "green" : "red"}>{store.isActive ? "Active" : "Inactive"}</Badge>
          <Badge color={store.isOpen ? "green" : "slate"}>{store.isOpen ? "Open" : "Closed by vendor"}</Badge>
          <Button size="sm" variant={store.isActive ? "danger" : "primary"} onClick={toggleActive} loading={toggling}>
            {store.isActive ? "Disable store" : "Enable store"}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Metric label="GMV (paid)" value={formatCurrency(stats.gmv)} sub={`${stats.orders.total} order${stats.orders.total === 1 ? "" : "s"}`} />
          <Metric label="Vendor payout" value={formatCurrency(stats.payout)} />
          <Metric label="Platform commission" value={formatCurrency(stats.commission)} />
          <Metric label="Orders in progress" value={stats.orders.pending} sub={stats.orders.refunds ? `${stats.orders.refunds} refund${stats.orders.refunds === 1 ? "" : "s"}` : undefined} />
          <Metric label="Products" value={stats.products.total} sub={`${stats.products.live} live`} />
          <Metric label="Staff" value={stats.staff} />
          <Metric label="Branches" value={stats.branches} />
          <Metric label="Customers" value={stats.customers} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Vendor contact</p>
          {owner ? (
            <dl className="text-sm space-y-1.5">
              <Detail label="Name">{owner.firstName} {owner.lastName}</Detail>
              <Detail label="Email">{owner.email}</Detail>
              {owner.phone && <Detail label="Phone">{owner.phone}</Detail>}
              <Detail label="Identity">
                <Badge color={owner.approvalStatus === "approved" ? "green" : owner.approvalStatus === "rejected" ? "red" : "amber"}>
                  {owner.approvalStatus}
                </Badge>
              </Detail>
              <Detail label="Signed up">{owner.createdAt ? formatDate(owner.createdAt) : "-"}</Detail>
              <Detail label="Last active">{owner.lastActiveAt ? formatDateTime(owner.lastActiveAt) : "never"}</Detail>
            </dl>
          ) : (
            <p className="text-sm text-slate-700">No owner on record</p>
          )}
        </div>

        <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Store details</p>
          <dl className="text-sm space-y-1.5">
            <Detail label="Plan">
              {getEffectivePlan(store) === "free"
                ? "Free"
                : `${getEffectivePlan(store) === "enterprise" ? "Enterprise" : "Plus"}${store.planRenewsAt ? ` until ${formatDate(store.planRenewsAt)}` : ""}${store.planCancelled ? " (not renewing)" : ""}`}
            </Detail>
            <Detail label="Created">{formatDate(store.createdAt)}</Detail>
            <Detail label="Currency">{store.currency}</Detail>
            <Detail label="Custom domain">{store.customDomain ? `${store.customDomain} (${store.domainStatus})` : "not set"}</Detail>
            {stats && (
              <>
                <Detail label="First order">{stats.firstOrderAt ? formatDate(stats.firstOrderAt) : "-"}</Detail>
                <Detail label="Last order">{stats.lastOrderAt ? formatDateTime(stats.lastOrderAt) : "-"}</Detail>
                <Detail label="Registers">
                  {stats.pos.registers}
                  {stats.pos.openSessions > 0 ? ` · ${stats.pos.openSessions} shift open now` : ""}
                </Detail>
                {stats.pos.lastSessionAt && <Detail label="Last shift opened">{formatDateTime(stats.pos.lastSessionAt)}</Detail>}
              </>
            )}
          </dl>
        </div>
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm p-5 max-w-md space-y-3">
        <p className="text-sm font-semibold text-slate-700">Payout account</p>
        {store.subAccountCode ? (
          <>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-800">Bank</dt>
                <dd className="text-slate-900 font-medium">{store.bankName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-800">Account number</dt>
                <dd className="text-slate-900 font-medium">{store.accountNumber}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-800">Account name</dt>
                <dd className="text-slate-900 font-medium">{store.accountName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-800">Paystack sub-account</dt>
                <dd className="text-slate-900 font-medium font-mono text-xs">{store.subAccountCode}</dd>
              </div>
            </dl>
            <p className="text-xs text-slate-800">
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

      <div className="bg-surface border border-slate-200 rounded-sm p-5 max-w-md space-y-3">
        <p className="text-sm font-semibold text-slate-700">Custom commission rate</p>
        <p className="text-xs text-slate-800">Leave blank to use the platform default rate.</p>
        <div className="flex items-end gap-3">
          <Input label="Commission rate (%)" type="number" min="0" max="100" step="0.1" value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} className="flex-1" />
          <Button onClick={saveRate} loading={saving}>Save</Button>
        </div>
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm p-5 max-w-md space-y-3">
        <p className="text-sm font-semibold text-slate-700">Custom Storezn+ price</p>
        <p className="text-xs text-slate-800">Leave blank to use the platform price. This recurring override is only for a negotiated price for this store; the first-month discount is controlled in Platform settings.</p>
        <div className="flex items-end gap-3">
          <Input label="Fixed monthly price (₦)" type="number" min="0" step="1" value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)} className="flex-1" />
          <Button onClick={savePrice} loading={savingPrice}>Save</Button>
        </div>
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm p-5 max-w-md space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">Plan (offline payment)</p>
          <Badge color={getEffectivePlan(store) === "free" ? "slate" : getEffectivePlan(store) === "enterprise" ? "blue" : "green"}>
            {getEffectivePlan(store) === "enterprise" ? "Enterprise" : getEffectivePlan(store) === "plus" ? "Plus" : "Free"}
          </Badge>
        </div>
        <p className="text-xs text-slate-800">
          {getEffectivePlan(store) === "free"
            ? "This store is on the free plan."
            : `${getEffectivePlan(store) === "enterprise" ? "Enterprise" : "Plus"} active until ${store.planRenewsAt ? formatDate(store.planRenewsAt) : "-"}${store.planCancelled ? " - won't auto-renew" : " - renews via Paystack"}.`}
          {" "}Use this when a business pays you directly (transfer/cash). The amount is
          logged to subscription revenue and the plan is granted for the months you enter,
          stacking on any time already left. It won&apos;t auto-renew. Enterprise adds the
          in-person point-of-sale suite (registers, shifts &amp; Z-reports, offline selling,
          cash reconciliation and the month-end forensic report) on top of everything in Plus.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Select
              label="Plan"
              searchable={false}
              options={[
                { value: "plus", label: "Storezn+" },
                { value: "enterprise", label: "Storezn Enterprise" },
              ]}
              value={plusForm.plan}
              onChange={(v) => setPlusForm((f) => ({ ...f, plan: v }))}
            />
          </div>
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
          {getEffectivePlan(store) === plusForm.plan ? "Extend" : "Activate"}{" "}
          {plusForm.plan === "enterprise" ? "Storezn Enterprise" : "Storezn+"}
        </Button>

        {subTx.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-medium text-slate-800 mb-1.5">Storezn+ payments</p>
            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-sm">
              {subTx.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="text-slate-800">{formatDate(s.paidAt)}</span>
                  <span className="text-slate-900 font-medium">{formatCurrency(s.amount)}</span>
                  <Badge color={s.manual ? "amber" : "slate"}>{s.manual ? "Offline" : "Paystack"}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-1">Store activity</p>
        <p className="text-xs text-slate-800 mb-3">
          The store&apos;s own audit trail: what the owner and staff have been doing. Latest 25.
        </p>
        {storeActivity.length === 0 ? (
          <p className="text-sm text-slate-700">Nothing logged yet.</p>
        ) : (
          <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-800 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">When</th>
                  <th className="px-4 py-3 font-medium">Who</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {storeActivity.map((r) => {
                  const kind = KIND[r.action] || { label: r.action, color: "slate" };
                  return (
                    <tr key={r.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r.actorName}</p>
                        <span className="text-xs text-slate-400">
                          {r.actorRole === "vendor" ? "Owner" : "Staff"}
                          {r.branchName ? ` · ${r.branchName}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3"><Badge color={kind.color}>{kind.label}</Badge></td>
                      <td className="px-4 py-3 text-slate-700">{r.summary}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adminActivity.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-1">Admin actions on this store</p>
          <p className="text-xs text-slate-800 mb-3">What the Storezn team has changed here.</p>
          <ul className="bg-surface border border-slate-200 rounded-sm divide-y divide-slate-100 text-sm">
            {adminActivity.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                <div>
                  <p className="text-slate-800">{ADMIN_ACTION_LABEL[a.action] || a.action}</p>
                  {a.metadata && typeof a.metadata === "object" && (
                    <p className="text-xs text-slate-400">
                      {a.action === "store.manual_plus"
                        ? `${a.metadata.plan === "enterprise" ? "Enterprise" : "Plus"} · ${formatCurrency(Number(a.metadata.amount || 0))} · ${a.metadata.months} month${a.metadata.months === 1 ? "" : "s"}${a.metadata.note ? ` · ${a.metadata.note}` : ""}`
                        : Object.entries(a.metadata)
                            .filter(([k]) => !["disabledReason"].includes(k))
                            .map(([k, v]) => `${k}: ${v === null ? "cleared" : v}`)
                            .join(" · ")}
                    </p>
                  )}
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                  {a.actorName} · {formatDateTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">Recent orders</p>
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-700">No orders yet.</p>
        ) : (
          <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-800 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Commission</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {t.isReturn ? "return" : t.channel === "pos" ? "POS" : t.channel === "manual" ? "recorded" : "online"}
                    </td>
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
