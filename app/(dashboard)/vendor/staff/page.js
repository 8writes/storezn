"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatDate } from "@/lib/format.js";

const EMPTY_FORM = { firstName: "", lastName: "", email: "", branchId: "" };

export default function VendorStaffPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();
  const { storeId, loading: storeLoading } = useVendorStore();

  const [staff, setStaff] = useState(null);
  const [maxStaff, setMaxStaff] = useState(1);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [branchBusyId, setBranchBusyId] = useState(null);

  const load = () => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/staff`)
      .then((data) => {
        setStaff(data.staff);
        setMaxStaff(data.max);
        setBranches(data.branches || []);
      })
      .catch((err) => toast.error(err.message || "Failed to load staff"));
  };

  useEffect(load, [token, storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Team management is owner-only (see isStoreOwner in lib/auth.js) - a
  // staff member landing here directly would just get a 401 from the API
  // above, this just skips the confusing empty form for them.
  if (user && user.role !== "vendor") {
    return <p className="text-sm text-slate-800">This page is only available to the store owner.</p>;
  }

  const invite = async (e) => {
    e.preventDefault();
    setInviting(true);
    try {
      const payload = { ...form };
      if (!payload.branchId) delete payload.branchId;
      await apiFetch(`/api/v1/vendor/stores/${storeId}/staff`, { method: "POST", body: JSON.stringify(payload) });
      toast.success(`Invite sent to ${form.email}`);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to invite staff");
    } finally {
      setInviting(false);
    }
  };

  const changeBranch = async (member, branchId) => {
    if ((branchId || null) === (member.branchId || null)) return;
    setBranchBusyId(member.id);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/staff/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ branchId: branchId || null }),
      });
      toast.success("Branch updated");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to update branch");
    } finally {
      setBranchBusyId(null);
    }
  };

  const remove = async (member) => {
    const ok = await confirm({
      title: `Remove ${member.firstName || member.email}?`,
      description: "They'll immediately lose access to this store's dashboard.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;

    setRemovingId(member.id);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/staff/${member.id}`, { method: "DELETE" });
      toast.success("Staff member removed");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to remove staff member");
    } finally {
      setRemovingId(null);
    }
  };

  const atLimit = (staff?.length ?? 0) >= maxStaff;

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Staff</h1>
        <p className="text-sm text-slate-800 mt-1">
          Invite people to help run your store. They get their own login, scoped to this store - everything except your payout account and this staff list.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="bg-surface border border-slate-200 rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-800 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Staff member</th>
                {branches.length > 1 && <th className="px-4 py-3 font-medium">Branch</th>}
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {storeLoading || staff === null ? (
                <TableRowSkeleton cols={branches.length > 1 ? 5 : 4} />
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={branches.length > 1 ? 5 : 4} className="px-4 py-6 text-center text-slate-400">No staff yet</td>
                </tr>
              ) : (
                staff.map((member) => (
                  <tr key={member.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-slate-400">{member.email}</p>
                    </td>
                    {branches.length > 1 && (
                      <td className="px-4 py-3">
                        <div className="max-w-[180px]">
                          <Select
                            value={member.branchId || ""}
                            onChange={(v) => changeBranch(member, v)}
                            disabled={branchBusyId === member.id}
                            options={[
                              { value: "", label: "All branches" },
                              ...branches.map((b) => ({ value: b.id, label: b.name })),
                            ]}
                          />
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-800">{formatDate(member.createdAt)}</td>
                    <td className="px-4 py-3">
                      {member.activatedAt ? (
                        <Badge color="green">Active</Badge>
                      ) : (
                        <Badge color="amber">Invited</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={removingId === member.id}
                        onClick={() => remove(member)}
                        className="inline-flex items-center gap-1.5 text-red-600 hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-surface border border-slate-200 rounded-sm p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700">Invite staff</p>
            <span className="text-xs text-slate-400">{staff?.length ?? 0} of {maxStaff}</span>
          </div>
          {atLimit ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-800">
                You&apos;ve reached the {maxStaff}-staff limit{maxStaff <= 1 ? " on the free plan" : ""}.{" "}
                {maxStaff <= 1 ? "Upgrade to Storezn+ for more staff seats." : "Remove someone before inviting another."}
              </p>
              {maxStaff <= 1 && (
                <Link href="/vendor/plus" className="inline-block text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Upgrade to Storezn+
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={invite} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input label="First name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required />
                <Input label="Last name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required />
              </div>
              <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              {branches.length > 1 && (
                <Select
                  label="Branch"
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  value={form.branchId}
                  onChange={(v) => setForm((f) => ({ ...f, branchId: v }))}
                  required
                />
              )}
              <Button type="submit" loading={inviting} fullWidth>
                <UserPlus size={16} />
                Send invite
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
