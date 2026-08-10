"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Select } from "@/components/ui/Select.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatDateTime } from "@/lib/format.js";

const STATUS_COLOR = { pending: "amber", approved: "green", rejected: "red" };
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function SuperAdminVendorsPage() {
  const { token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();

  const [vendors, setVendors] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set("status", status);
    apiFetch(`/api/v1/super-admin/vendors?${params}`)
      .then((data) => {
        setVendors(data.vendors);
        setPagination(data.pagination);
      })
      .catch((err) => toast.error(err.message || "Failed to load vendors"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, status]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const handleDecision = async (vendor, decision) => {
    const requireReason = decision === "rejected";
    const result = await confirm({
      title: decision === "approved" ? `Approve ${vendor.firstName}?` : `Reject ${vendor.firstName}?`,
      description: requireReason ? "Tell them why - they'll see this note and can resubmit." : undefined,
      requireReason,
      confirmLabel: decision === "approved" ? "Approve" : "Reject",
      variant: requireReason ? "danger" : "default",
    });
    // requireReason: result is the reason string, or null if cancelled.
    // Otherwise result is a plain true/false - either way, falsy means cancel.
    if (!result) return;

    setDecidingId(vendor.id);
    try {
      await apiFetch(`/api/v1/super-admin/vendors/${vendor.id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision, reviewNote: requireReason ? result : undefined }),
      });
      toast.success(decision === "approved" ? "Vendor approved" : "Vendor rejected");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to update vendor");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      <h1 className="text-xl font-bold text-slate-900">Vendor verification</h1>

      <div className="max-w-xs">
        <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Store(s)</th>
              <th className="px-4 py-3 font-medium">NIN</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={6} />
            ) : vendors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">No vendors match</td>
              </tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{v.firstName} {v.lastName}</p>
                    <p className="text-xs text-slate-400">{v.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{v.storeNames.join(", ") || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{v.nin || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{v.ninSubmittedAt ? formatDateTime(v.ninSubmittedAt) : "-"}</td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLOR[v.approvalStatus] || "slate"}>{v.approvalStatus}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {v.nin && v.approvalStatus !== "approved" && (
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          disabled={decidingId === v.id}
                          onClick={() => handleDecision(v, "approved")}
                          className="text-green-600 hover:underline disabled:opacity-50 cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={decidingId === v.id}
                          onClick={() => handleDecision(v, "rejected")}
                          className="text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
