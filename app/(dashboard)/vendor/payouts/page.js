"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet, Calendar, Landmark, Info, RefreshCw, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Select } from "@/components/ui/Select.js";
import { Input } from "@/components/ui/Input.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { InfoTip } from "@/components/ui/InfoTip.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { StatCard } from "@/components/ui/StatCard.js";
import { StatGridSkeleton, TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatCurrency, formatDate } from "@/lib/format.js";
import { estimatedSettlementDate } from "@/lib/settlement.js";

const CHANNEL_OPTIONS = [
  { value: "", label: "All transactions" },
  { value: "online", label: "Paystack (online checkout)" },
  { value: "offline", label: "Recorded offline" },
];

const EMPTY_PAYOUT_FORM = { bankCode: "", accountNumber: "", accountName: "" };

export default function VendorPayoutsPage() {
  const router = useRouter();
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const { stores, storeId, loading: storesLoading, updateStore } = useVendorStore();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingSettlements, setCheckingSettlements] = useState(false);

  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [payoutForm, setPayoutForm] = useState(EMPTY_PAYOUT_FORM);
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const resolveDebounceRef = useRef(null);

  useEffect(() => {
    // Also gated on token, not just storeId - see VendorStoreContext.js:
    // storeId can already be populated (shared context, not remounted)
    // before this page's own token has resolved on a client-side
    // navigation, which would otherwise fire this fetch with no
    // Authorization header.
    if (!token || !storeId) return;
    setBanksLoading(true);
    apiFetch(`/api/v1/vendor/stores/${storeId}/payout-account`)
      .then((data) => setBanks(data.banks || []))
      .catch((err) => toast.error(err.message || "Failed to load bank list"))
      .finally(() => setBanksLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId]);

  const loadPayouts = () => {
    if (!token || !storeId) return Promise.resolve();
    const params = new URLSearchParams({ page: String(page) });
    if (channel) params.set("channel", channel);
    if (q.trim()) params.set("q", q.trim());
    return apiFetch(`/api/v1/vendor/stores/${storeId}/payouts?${params}`)
      .then(setData)
      .catch((err) => toast.error(err.message || "Failed to load payouts"));
  };

  useEffect(() => {
    if (!token || !storeId) return;
    setLoading(true);
    loadPayouts().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, storeId, page, channel, q]);

  useEffect(() => {
    setPage(1);
  }, [channel, q, storeId]);

  // Resolves the account holder's name live as the vendor types, so they
  // can see who they're actually about to lock in before submitting -
  // the account can't be changed again without going through support
  // once linked, so this is the one chance to catch a wrong number.
  useEffect(() => {
    clearTimeout(resolveDebounceRef.current);
    setResolveError("");

    if (payoutForm.accountNumber.length !== 10 || !payoutForm.bankCode) {
      setPayoutForm((f) => (f.accountName ? { ...f, accountName: "" } : f));
      return;
    }

    resolveDebounceRef.current = setTimeout(async () => {
      setResolving(true);
      try {
        const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/payout-account/resolve`, {
          method: "POST",
          body: JSON.stringify({ bankCode: payoutForm.bankCode, accountNumber: payoutForm.accountNumber }),
        });
        setPayoutForm((f) => ({ ...f, accountName: data.accountName }));
      } catch (err) {
        setPayoutForm((f) => ({ ...f, accountName: "" }));
        setResolveError(err.message || "Could not resolve account name");
      } finally {
        setResolving(false);
      }
    }, 600);

    return () => clearTimeout(resolveDebounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payoutForm.accountNumber, payoutForm.bankCode, storeId]);

  const handleLinkAccount = async (e) => {
    e.preventDefault();
    setLinkingAccount(true);
    try {
      const result = await apiFetch(`/api/v1/vendor/stores/${storeId}/payout-account`, {
        method: "POST",
        body: JSON.stringify({ bankCode: payoutForm.bankCode, accountNumber: payoutForm.accountNumber }),
      });
      updateStore(result.store);
      setPayoutForm(EMPTY_PAYOUT_FORM);
      toast.success(`Verified, payouts go to ${result.store.accountName}`);
      loadPayouts();
    } catch (err) {
      toast.error(err.message || "Could not verify that account");
    } finally {
      setLinkingAccount(false);
    }
  };

  const handleCheckSettlements = async () => {
    setCheckingSettlements(true);
    try {
      const result = await apiFetch(`/api/v1/vendor/stores/${storeId}/payouts/refresh`, { method: "POST" });
      await loadPayouts();
      toast[result.updated > 0 ? "success" : "message"](
        result.updated > 0 ? `${result.updated} order${result.updated === 1 ? "" : "s"} confirmed settled` : "No new settlements yet",
      );
    } catch (err) {
      toast.error(err.message || "Could not check settlements");
    } finally {
      setCheckingSettlements(false);
    }
  };

  if (!storesLoading && stores.length === 0) {
    return <p className="text-sm text-slate-700">No store set up yet.</p>;
  }

  // Payout account/bank details are owner-only (see isStoreOwner in
  // lib/auth.js) - staff never see them, even read-only.
  if (user && user.role !== "vendor") {
    return <p className="text-sm text-slate-500">This page is only available to the store owner.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Payouts</h1>

      <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Payout account</label>
          <Badge color={data?.payoutAccount ? "green" : "amber"}>
            {data?.payoutAccount ? "Verified" : "Not linked"}
          </Badge>
          {!data?.payoutAccount && (
            <InfoTip>We verify it and set up automatic payouts through Paystack. Customers can&apos;t check out until this is done.</InfoTip>
          )}
        </div>

        {data?.payoutAccount ? (
          <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-sm p-4 text-sm text-green-800">
            <Landmark size={18} className="shrink-0 mt-0.5 hidden md:block" />
            <div>
              <p className="font-medium flex items-center gap-1.5">
                {data.payoutAccount.accountName}
                <InfoTip>Locked once set, for security. Contact support to change your payout account.</InfoTip>
              </p>
              <p>{data.payoutAccount.bankName} · {data.payoutAccount.accountNumber}</p>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={handleLinkAccount} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Bank"
                options={banks.map((b) => ({ value: b.code, label: b.name }))}
                loading={banksLoading}
                searchable
                value={payoutForm.bankCode}
                onChange={(v) => setPayoutForm((f) => ({ ...f, bankCode: v }))}
                required
              />
              <Input
                label="Account number"
                placeholder="0123456789"
                maxLength={10}
                value={payoutForm.accountNumber}
                onChange={(e) => setPayoutForm((f) => ({ ...f, accountNumber: e.target.value.replace(/\D/g, "") }))}
                required
              />
              <div className="sm:col-span-2 flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Account name</label>
                <div className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-sm bg-slate-50 text-base min-h-[42px]">
                  {resolving ? (
                    <>
                      <Loader2 size={15} className="animate-spin text-slate-700" />
                      <span className="text-slate-700">Resolving…</span>
                    </>
                  ) : payoutForm.accountName ? (
                    <span className="text-slate-900">{payoutForm.accountName}</span>
                  ) : (
                    <span className="text-slate-700">Enter your bank and account number above</span>
                  )}
                </div>
                {resolveError && <p className="text-xs text-red-500">{resolveError}</p>}
              </div>
              <Button type="submit" loading={linkingAccount} disabled={!payoutForm.accountName || resolving} className="sm:col-span-2 w-fit">
                Verify &amp; link account
              </Button>
            </form>
          </>
        )}
      </div>

      <div className="flex items-start gap-3 bg-brand-50 border border-brand-100 rounded-sm p-4">
        <Info
          size={18}
          className="text-brand-600 hidden md:block shrink-0 mt-0.5"
        />
        <div className="flex-1 text-sm text-brand-800">
          <p>
            Paystack settles online orders <strong>the next business day</strong>.{" "}
            <InfoTip>Weekends push it to the following Monday. Offline sales are already yours since you collected them in person.</InfoTip>
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3"
            loading={checkingSettlements}
            onClick={handleCheckSettlements}
            disabled={!data?.payoutAccount}
          >
            <RefreshCw size={14} /> Check settlements
          </Button>
        </div>
      </div>

      {loading || !data ? (
        <StatGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={Wallet}
            label="Lifetime payouts"
            value={formatCurrency(data.stats.lifetimeTotal)}
            color="green"
          />
          <StatCard
            icon={Calendar}
            label="This month"
            value={formatCurrency(data.stats.thisMonthTotal)}
          />
          <StatCard
            icon={Landmark}
            label="Via Paystack"
            value={formatCurrency(data.stats.onlineTotal)}
            sub={`${data.stats.ordersCount} paid · ${data.stats.pendingSettlementCount} pending`}
          />
          <StatCard
            icon={Wallet}
            label="Recorded offline"
            value={formatCurrency(data.stats.offlineTotal)}
            color="amber"
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="max-w-xs">
          <Select
            label="Filter"
            options={CHANNEL_OPTIONS}
            value={channel}
            onChange={setChannel}
          />
        </div>
        <SearchInput value={q} onSearch={setQ} placeholder="Search by order number..." className="max-w-xs" />
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Paid on</th>
              <th className="px-4 py-3 font-medium">Order total</th>
              <th className="px-4 py-3 font-medium">Fees</th>
              <th className="px-4 py-3 font-medium">Your payout</th>
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Settlement</th>
            </tr>
          </thead>
          <tbody>
            {loading || !data ? (
              <TableRowSkeleton cols={7} />
            ) : data.transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-slate-700"
                >
                  {q ? "No payouts match your search" : "No payouts yet"}
                </td>
              </tr>
            ) : (
              data.transactions.map((t) => {
                const paidAt = t.paidAt || t.createdAt;
                return (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`/vendor/orders/${t.id}?storeId=${storeId}`)}
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        href={`/vendor/orders/${t.id}?storeId=${storeId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {t.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(paidAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatCurrency(t.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatCurrency(t.commissionAmount + (t.flatFeeAmount || 0))} (
                      {t.commissionRatePercent}%{t.flatFeeAmount > 0 ? ` + ${formatCurrency(t.flatFeeAmount)} flat` : ""})
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatCurrency(t.vendorPayoutAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={t.isOffline ? "amber" : "green"}>
                        {t.isOffline ? "Offline" : "Paystack"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {t.isOffline ? (
                        <span className="text-slate-700">
                          Collected in person
                        </span>
                      ) : t.settledAt ? (
                        <Badge color="green">
                          Paid {formatDate(t.settledAt)}
                        </Badge>
                      ) : (
                        <div>
                          <Badge color="amber">Pending</Badge>
                          <p className="text-xs text-slate-700 mt-0.5">
                            Expected{" "}
                            {formatDate(estimatedSettlementDate(paidAt))}
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination pagination={data?.pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
