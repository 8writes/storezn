"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { Select } from "@/components/ui/Select.js";
import { Badge } from "@/components/ui/Badge.js";
import { Button } from "@/components/ui/Button.js";
import { SearchInput } from "@/components/ui/SearchInput.js";
import { Pagination } from "@/components/ui/Pagination.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { RevealNin } from "@/components/ui/RevealNin.js";
import { formatDateTime, formatRelativeTime } from "@/lib/format.js";

const isOnlineNow = (ts) => !!ts && Date.now() - new Date(ts).getTime() < 5 * 60_000;

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
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState(null);
  const [verifyingEmailId, setVerifyingEmailId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
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
  }, [token, page, status, q]);

  useEffect(() => {
    setPage(1);
  }, [status, q]);

  const handleDecision = async (vendor, decision) => {
    const requireReason = decision === "rejected";
    const wasApproved = vendor.approvalStatus === "approved";
    const title = decision === "approved" ? `Approve ${vendor.firstName}?` : wasApproved ? `Unverify ${vendor.firstName}?` : `Reject ${vendor.firstName}?`;
    const description = requireReason
      ? wasApproved
        ? "Tell them why - their store goes offline immediately and they can resubmit their NIN."
        : "Tell them why - they'll see this note and can resubmit."
      : undefined;
    const result = await confirm({
      title,
      description,
      requireReason,
      confirmLabel: decision === "approved" ? "Approve" : wasApproved ? "Unverify" : "Reject",
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
      toast.success(decision === "approved" ? "Vendor approved" : wasApproved ? "Vendor unverified - their store is now offline" : "Vendor rejected");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to update vendor");
    } finally {
      setDecidingId(null);
    }
  };

  // For a vendor stuck unable to even sign in because their verification
  // email never arrived (deliverability issue, not something they did
  // wrong) - separate from the NIN/identity decision above, which only
  // gates whether their store can go live, not whether they can log in.
  const handleVerifyEmail = async (vendor) => {
    setVerifyingEmailId(vendor.id);
    try {
      await apiFetch(`/api/v1/super-admin/vendors/${vendor.id}/verify-email`, { method: "PATCH", body: JSON.stringify({}) });
      toast.success("Email marked as verified - they can sign in now");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to verify email");
    } finally {
      setVerifyingEmailId(null);
    }
  };

  const handleToggleSuspend = async (vendor) => {
    const next = !vendor.isBanned;
    const ok = await confirm({
      title: next ? `Suspend ${vendor.firstName}?` : `Restore ${vendor.firstName}?`,
      description: next
        ? "They can't sign in and their store(s) go offline until you restore them. Nothing is deleted."
        : "Un-suspends the vendor and brings back any store they took offline themselves.",
      confirmLabel: next ? "Suspend" : "Restore",
      variant: next ? "danger" : "default",
    });
    if (!ok) return;
    setBusyId(vendor.id);
    try {
      await apiFetch(`/api/v1/super-admin/vendors/${vendor.id}`, { method: "PATCH", body: JSON.stringify({ isBanned: next }) });
      toast.success(next ? "Vendor suspended" : "Vendor restored");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to update vendor");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteAccount = async (vendor) => {
    const result = await confirm({
      title: `Delete ${vendor.firstName} ${vendor.lastName}'s account?`,
      description:
        "Permanent. Removes the vendor and every store they own - all products, photos, categories, branches, staff, orders, reviews and subscription history. This cannot be undone.",
      requireReason: true,
      reasonLabel: "Type DELETE to confirm",
      confirmLabel: "Delete permanently",
      variant: "danger",
    });
    if (!result) return;
    if (result !== "DELETE") {
      toast.error("Type DELETE to confirm");
      return;
    }
    setBusyId(vendor.id);
    try {
      await apiFetch(`/api/v1/super-admin/vendors/${vendor.id}`, { method: "DELETE" });
      toast.success("Vendor account deleted");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to delete account");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      <h1 className="text-xl font-bold text-slate-900">Vendor verification</h1>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="max-w-xs">
          <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        </div>
        <SearchInput value={q} onSearch={setQ} placeholder="Search by name or email..." className="max-w-sm" />
      </div>

      <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Last active</th>
              <th className="px-4 py-3 font-medium">Store(s)</th>
              <th className="px-4 py-3 font-medium">NIN</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Notifications</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableRowSkeleton cols={10} />
            ) : vendors.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-slate-700">No vendors match{q ? " your search" : ""}</td>
              </tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{v.firstName} {v.lastName}</p>
                    <p className="text-xs text-slate-700">{v.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {v.phone ? (
                      <a href={`tel:${v.phone}`} className="text-brand-600 hover:underline block">{v.phone}</a>
                    ) : (
                      <span className="text-slate-400 block">No phone</span>
                    )}
                    {v.whatsapp ? (
                      <a
                        href={`https://wa.me/${v.whatsapp.replace(/[^\d]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-green-600 hover:underline block mt-0.5"
                      >
                        WhatsApp {v.whatsapp}
                      </a>
                    ) : (
                      <span className="text-slate-400 block mt-0.5">No WhatsApp</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${isOnlineNow(v.lastActiveAt) ? "bg-green-500" : "bg-slate-300"}`}
                        aria-hidden
                      />
                      <span className={isOnlineNow(v.lastActiveAt) ? "text-green-700 font-medium" : "text-slate-500"}>
                        {isOnlineNow(v.lastActiveAt) ? "Active now" : formatRelativeTime(v.lastActiveAt)}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{v.storeNames.join(", ") || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    <RevealNin hasNin={v.hasNin} apiFetch={apiFetch} endpoint={`/api/v1/super-admin/vendors/${v.id}/nin`} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{v.ninSubmittedAt ? formatDateTime(v.ninSubmittedAt) : "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge color={STATUS_COLOR[v.approvalStatus] || "slate"}>{v.approvalStatus}</Badge>
                      {v.isBanned && <Badge color="red">Suspended</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={v.emailVerified ? "green" : "amber"}>{v.emailVerified ? "Verified" : "Unverified"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <Badge color={v.pushDeviceCount > 0 ? "green" : "slate"}>
                        {v.pushDeviceCount > 0
                          ? `Push · ${v.pushDeviceCount} device${v.pushDeviceCount === 1 ? "" : "s"}`
                          : "No push"}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        Email {v.emailNotificationsEnabled ? "on" : "off"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end items-center gap-3 flex-wrap">
                      {!v.emailVerified && (
                        <button
                          type="button"
                          disabled={verifyingEmailId === v.id}
                          onClick={() => handleVerifyEmail(v)}
                          className="text-green-600 hover:underline disabled:opacity-50 cursor-pointer"
                        >
                          Verify email
                        </button>
                      )}
                      {v.hasNin && v.approvalStatus === "approved" && (
                        <button
                          type="button"
                          disabled={decidingId === v.id}
                          onClick={() => handleDecision(v, "rejected")}
                          className="text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                        >
                          Unverify
                        </button>
                      )}
                      {v.hasNin && v.approvalStatus !== "approved" && (
                        <>
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
                        </>
                      )}
                      <button
                        type="button"
                        disabled={busyId === v.id}
                        onClick={() => handleToggleSuspend(v)}
                        className="text-slate-600 hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        {v.isBanned ? "Restore" : "Suspend"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === v.id}
                        onClick={() => handleDeleteAccount(v)}
                        className="text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        Delete account
                      </button>
                    </div>
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
