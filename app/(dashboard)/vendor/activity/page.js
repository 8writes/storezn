"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Badge } from "@/components/ui/Badge.js";
import { Select } from "@/components/ui/Select.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatDateTime } from "@/lib/format.js";
import { Check, Flag } from "lucide-react";

const GROUPS = [
  { value: "", label: "All activity" },
  { value: "pos", label: "Sales & returns" },
  { value: "cash", label: "Cash drawer" },
  { value: "register", label: "Register open / close" },
  { value: "stock", label: "Stock changes" },
  { value: "product", label: "Product changes" },
  { value: "order", label: "Recorded past sales" },
  { value: "staff", label: "Staff changes" },
];

// action -> {label, color} for the chip. Prefix match on the first segment.
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

function targetHref(row, storeId) {
  if (row.targetType === "order" && row.targetId) return `/vendor/orders/${row.targetId}?storeId=${storeId}`;
  if (row.targetType === "product" && row.targetId && row.action !== "product.delete") return `/vendor/products/${row.targetId}?storeId=${storeId}`;
  return null;
}

export default function VendorActivityPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { storeId, loading: storeLoading } = useVendorStore();

  const [rows, setRows] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!token || !storeId) return;
    const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (group) qs.set("group", group);
    if (flaggedOnly) qs.set("flagged", "true");
    apiFetch(`/api/v1/vendor/stores/${storeId}/activity?${qs}`)
      .then((data) => {
        setRows(data.activity);
        setPagination(data.pagination);
        setDenied(false);
      })
      .catch((err) => {
        if (/owner/i.test(err.message || "")) setDenied(true);
        else toast.error(err.message || "Failed to load activity");
      });
  }, [token, storeId, page, group, flaggedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFlag = async (row, action) => {
    let note;
    if (action === "flag") {
      note = window.prompt("Optional note for your review:", "");
      if (note === null) return;
    }
    setUpdatingId(row.id);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/activity/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, ...(note?.trim() ? { note: note.trim() } : {}) }),
      });
      if (flaggedOnly && action !== "flag") setRows((current) => current.filter((item) => item.id !== row.id));
      else setRows((current) => current.map((item) => item.id === row.id ? { ...item, ...data.activity } : item));
      toast.success(action === "flag" ? "Activity flagged" : "Activity marked as reviewed");
    } catch (error) {
      toast.error(error.message || "Failed to update activity");
    } finally {
      setUpdatingId(null);
    }
  };

  if (user && user.role !== "vendor") {
    return <p className="text-sm text-slate-800">The activity log is only available to the store owner.</p>;
  }
  if (denied) {
    return <p className="text-sm text-slate-800">The activity log is only available to the store owner.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Activity log</h1>
        <p className="text-sm text-slate-800 mt-1">
          Every important action on your store: who rang up which sale, cash-drawer moves, returns, price and stock changes, staff changes.
        </p>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-full max-w-xs">
        <Select
          label="Show"
          options={GROUPS}
          value={group}
          onChange={(v) => {
            setGroup(v);
            setPage(1);
          }}
        />
        </div>
        <button
          type="button"
          aria-pressed={flaggedOnly}
          onClick={() => { setFlaggedOnly((value) => !value); setPage(1); }}
          className={`h-10 px-3 border rounded-sm text-sm font-medium inline-flex items-center gap-2 cursor-pointer ${flaggedOnly ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          <Flag size={15} fill={flaggedOnly ? "currentColor" : "none"} />
          Flagged only
        </button>
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-800 text-left">
            <tr>
              <th className="px-4 py-3 font-medium whitespace-nowrap">When</th>
              <th className="px-4 py-3 font-medium">Who</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Details</th>
              <th className="px-4 py-3 font-medium text-right">Review</th>
            </tr>
          </thead>
          <tbody>
            {rows === null || storeLoading ? (
              <TableRowSkeleton cols={5} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nothing logged for this filter yet</td>
              </tr>
            ) : (
              rows.map((r) => {
                const kind = KIND[r.action] || { label: r.action, color: "slate" };
                const href = targetHref(r, storeId);
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
                    <td className="px-4 py-3">
                      <Badge color={kind.color}>{kind.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {href ? (
                        <Link href={href} className="text-brand-600 hover:underline">
                          {r.summary}
                        </Link>
                      ) : (
                        r.summary
                      )}
                      {r.flagNote && <p className="mt-1 text-xs text-amber-800">Review note: {r.flagNote}</p>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.flaggedAt && !r.reviewedAt ? (
                        <button type="button" title="Mark reviewed" aria-label="Mark activity reviewed" disabled={updatingId === r.id} onClick={() => updateFlag(r, "review")} className="p-2 text-amber-700 hover:bg-amber-50 rounded-sm cursor-pointer disabled:opacity-50">
                          <Check size={17} />
                        </button>
                      ) : (
                        <button type="button" title="Flag for review" aria-label="Flag activity for review" disabled={updatingId === r.id} onClick={() => updateFlag(r, "flag")} className="p-2 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-sm cursor-pointer disabled:opacity-50">
                          <Flag size={17} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
