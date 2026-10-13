"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Vault } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";
import { PageHeader } from "@/components/ui/PageHeader.js";
import { FormSkeleton } from "@/components/ui/Skeleton.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { formatKobo } from "@/lib/money.js";
import { formatDateTime } from "@/lib/format.js";
import { isEnterpriseStore } from "@/lib/storePlan.js";
import { FeatureLocked } from "@/components/ui/FeatureLocked.js";

// The back-office safe, as a running record. Cash arrives here when a
// till drops it and leaves when a till is topped up - both of those are
// recorded automatically as the other half of the drawer movement, so
// this page only ever adds the parts with no till involved: the opening
// balance, money paid straight out of the safe (the daily contribution, a
// supplier, a bank deposit), and a correction after a physical recount.

const KINDS = [
  { value: "expense_out", label: "Paid out", hint: "Money leaving the safe directly - a daily contribution, a supplier, a bank deposit." },
  { value: "adjustment", label: "Adjustment", hint: "Correct the recorded balance against what is physically in the safe." },
  { value: "opening", label: "Opening balance", hint: "What is in the safe today. Recorded once per branch, to start the ledger off." },
];

const newRef = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `safe_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
};

export default function SafePage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { stores, storeId, loading: storesLoading } = useVendorStore();
  const { confirm, confirmDialog } = useConfirm();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("expense_out");
  const [branchId, setBranchId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState("down");
  const [submitting, setSubmitting] = useState(false);

  const activeStore = stores?.find((store) => store.id === storeId);
  const isOwner = user?.role === "vendor" || user?.role === "super_admin";

  const load = useCallback(async () => {
    if (!token || !storeId) return;
    try {
      const res = await apiFetch(`/api/v1/vendor/stores/${storeId}/safe`);
      setData(res);
      setBranchId((current) => current || res.byBranch?.[0]?.branchId || "");
    } catch (err) {
      toast.error(err.message || "Couldn't load the safe");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, storeId, token]);

  // load() only sets state after its await resolves, so nothing here is
  // the synchronous cascade the rule guards against - same shape as every
  // other data-loading page in the dashboard.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (!storesLoading && activeStore && !isEnterpriseStore(activeStore)) {
    return (
      <FeatureLocked
        plan="enterprise"
        feature="The safe"
        description="Keep a running record of the cash in your back office: what each till drops in, what it draws back out, and what you pay straight out of it."
      />
    );
  }

  const active = KINDS.find((entry) => entry.value === kind);
  const valid = branchId && Number(amount) > 0 && (kind === "opening" || reason.trim().length > 0);

  const submit = async () => {
    if (!valid || submitting) return;
    const ok = await confirm({
      title: `Record ${active.label.toLowerCase()} of ${formatKobo(Math.round(Number(amount) * 100))}?`,
      description: reason.trim() || "This is kept on the safe's record and can't be edited afterwards.",
      confirmLabel: `Record ${active.label.toLowerCase()}`,
      variant: kind === "opening" ? "brand" : "danger",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/safe`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          branchId,
          amount: Number(amount),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(kind === "adjustment" ? { direction } : {}),
          clientRef: newRef(),
        }),
      });
      toast.success("Recorded");
      setAmount("");
      setReason("");
      load();
    } catch (err) {
      toast.error(err.message || "Couldn't record that");
    } finally {
      setSubmitting(false);
    }
  };

  if (!storesLoading && (!stores || stores.length === 0)) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Safe"
        description="What the back office is holding. Drops from a till and top-ups back to one are recorded automatically; add anything paid straight out of the safe here."
      />

      {loading || !data ? (
        <FormSkeleton fields={4} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            <div className="rounded-sm border border-slate-200 bg-surface p-5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Vault size={14} /> In the safe
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{formatKobo(data.balanceKobo || 0)}</p>
              {data.byBranch?.length > 1 && (
                <div className="mt-3 space-y-1 border-t border-slate-200 pt-3">
                  {data.byBranch.map((branch) => (
                    <div key={branch.branchId} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{branch.branchName}</span>
                      <span className="tabular-nums text-slate-900">{formatKobo(branch.balanceKobo)}</span>
                    </div>
                  ))}
                </div>
              )}
              {(data.balanceKobo || 0) === 0 && (
                <p className="mt-3 rounded-sm border border-amber-200 bg-amber-100 px-3 py-2 text-xs text-amber-900">
                  Nothing recorded yet. Past cash drops were never tracked here, so the safe starts empty - record an
                  opening balance for what is physically in it today.
                </p>
              )}
            </div>

            <div className="rounded-sm border border-slate-200 bg-surface p-5 space-y-3">
              <p className="text-sm font-semibold text-slate-900">Record a movement</p>
              <div className="grid grid-cols-3 gap-2">
                {KINDS.filter((entry) => isOwner || entry.value === "expense_out").map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setKind(entry.value)}
                    className={`rounded-sm border py-2 text-xs font-medium cursor-pointer transition-colors ${
                      kind === entry.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-800">{active.hint}</p>

              {data.byBranch?.length > 1 && (
                <Select
                  label="Branch"
                  searchable={false}
                  options={data.byBranch.map((branch) => ({ value: branch.branchId, label: branch.branchName }))}
                  value={branchId}
                  onChange={setBranchId}
                />
              )}

              {kind === "adjustment" && (
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: "up", label: "Found more" }, { value: "down", label: "Found less" }].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDirection(option.value)}
                      className={`rounded-sm border py-2 text-xs font-medium cursor-pointer ${
                        direction === option.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Amount"
                className="w-full rounded-sm border border-slate-300 px-3 py-2 text-base tabular-nums outline-none focus:border-brand-500"
              />
              <input
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={kind === "opening" ? "Note (optional)" : "Reason (required)"}
                className="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <Button type="button" fullWidth loading={submitting} disabled={!valid || submitting} onClick={submit}>
                Record {active.label.toLowerCase()}
              </Button>
            </div>
          </div>

          <div className="rounded-sm border border-slate-200 bg-surface">
            <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Recent movements</p>
            {data.movements?.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-700">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.movements.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{row.label}</p>
                      <p className="text-xs text-slate-600">{row.reason || "No reason given"}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{formatDateTime(row.createdAt)}</p>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${row.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {row.amount < 0 ? "−" : "+"}{formatKobo(Math.abs(row.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
