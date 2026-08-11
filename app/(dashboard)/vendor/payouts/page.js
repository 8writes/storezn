"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet, Calendar, Landmark, AlertTriangle, Info, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { Select } from "@/components/ui/Select.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
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

export default function VendorPayoutsPage() {
  const router = useRouter();
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingSettlements, setCheckingSettlements] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/v1/vendor/stores")
      .then((data) => {
        setStores(data.stores);
        if (data.stores.length > 0) setStoreId(data.stores[0].id);
        else setLoading(false);
      })
      .catch((err) => toast.error(err.message || "Failed to load your store"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadPayouts = () => {
    if (!storeId) return Promise.resolve();
    const params = new URLSearchParams({ page: String(page) });
    if (channel) params.set("channel", channel);
    if (q.trim()) params.set("q", q.trim());
    return apiFetch(`/api/v1/vendor/stores/${storeId}/payouts?${params}`)
      .then(setData)
      .catch((err) => toast.error(err.message || "Failed to load payouts"));
  };

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    loadPayouts().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, page, channel, q]);

  useEffect(() => {
    setPage(1);
  }, [channel, q, storeId]);

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

  if (!loading && stores.length === 0) {
    return <p className="text-sm text-slate-400">No store set up yet.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Payouts</h1>

      {stores.length > 1 && (
        <div className="max-w-xs">
          <Select
            label="Store"
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
            value={storeId}
            onChange={setStoreId}
          />
        </div>
      )}

      {!data?.payoutAccount && !loading && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm p-4">
          <AlertTriangle
            size={18}
            className="text-amber-600 shrink-0 hidden md:block mt-0.5"
          />
          <div className="text-sm text-amber-800">
            <p className="font-medium">No payout account linked</p>
            <p>
              Online orders can&apos;t pay out until you link a bank account.{" "}
              <Link href="/vendor/settings" className="underline font-medium">
                Link one now
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {data?.payoutAccount && (
        <div className="bg-white border border-slate-200 rounded-sm p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-brand-100 text-brand-700 hidden md:flex items-center justify-center shrink-0">
            <Landmark size={16} />
          </div>
          <div className="text-sm min-w-0">
            <p className="font-medium text-slate-900">
              Online orders pay out to this account
            </p>
            <p className="text-slate-500">
              {data.payoutAccount.accountName} · {data.payoutAccount.bankName} ·{" "}
              {data.payoutAccount.accountNumber}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 bg-brand-50 border border-brand-100 rounded-sm p-4">
        <Info
          size={18}
          className="text-brand-600 hidden md:block shrink-0 mt-0.5"
        />
        <div className="flex-1 text-sm text-brand-800">
          <p>
            Paystack settles online orders to your bank account{" "}
            <strong>the next business day</strong> after payment, not instantly
            - weekends push it to the following Monday. Offline sales are
            already yours since you collected them in person.
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

      <div className="flex flex-col sm:flex-row gap-4">
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
              <th className="px-4 py-3 font-medium">Commission</th>
              <th className="px-4 py-3 font-medium">Your payout</th>
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Settlement</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={7} />
            ) : data.transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-slate-400"
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
                      {formatCurrency(t.commissionAmount)} (
                      {t.commissionRatePercent}%)
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
                        <span className="text-slate-400">
                          Collected in person
                        </span>
                      ) : t.settledAt ? (
                        <Badge color="green">
                          Paid {formatDate(t.settledAt)}
                        </Badge>
                      ) : (
                        <div>
                          <Badge color="amber">Pending</Badge>
                          <p className="text-xs text-slate-400 mt-0.5">
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
