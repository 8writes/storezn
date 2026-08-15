"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth.js";
import { useApi } from "@/hooks/useApi.js";
import { useConfirm } from "@/hooks/useConfirm.js";
import { useVendorStore } from "@/components/VendorStoreContext.js";
import { Input } from "@/components/ui/Input.js";
import { Button } from "@/components/ui/Button.js";
import { Badge } from "@/components/ui/Badge.js";
import { TableRowSkeleton } from "@/components/ui/Skeleton.js";
import { formatDate } from "@/lib/format.js";

const EMPTY_FORM = { firstName: "", lastName: "", email: "" };

export default function VendorStaffPage() {
  const { user, token } = useAuth(true);
  const { apiFetch } = useApi(token);
  const { confirm, confirmDialog } = useConfirm();
  const { storeId, loading: storeLoading } = useVendorStore();

  const [staff, setStaff] = useState(null);
  const [maxStaff, setMaxStaff] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const load = () => {
    if (!token || !storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/staff`)
      .then((data) => {
        setStaff(data.staff);
        setMaxStaff(data.max);
      })
      .catch((err) => toast.error(err.message || "Failed to load staff"));
  };

  useEffect(load, [token, storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Team management is owner-only (see isStoreOwner in lib/auth.js) - a
  // staff member landing here directly would just get a 401 from the API
  // above, this just skips the confusing empty form for them.
  if (user && user.role !== "vendor") {
    return <p className="text-sm text-slate-500">This page is only available to the store owner.</p>;
  }

  const invite = async (e) => {
    e.preventDefault();
    setInviting(true);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/staff`, { method: "POST", body: JSON.stringify(form) });
      toast.success(`Invite sent to ${form.email}`);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to invite staff");
    } finally {
      setInviting(false);
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
        <p className="text-sm text-slate-500 mt-1">
          Invite people to help run your store. They get their own login, scoped to this store - everything except your payout account and this staff list.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Staff member</th>
              <th className="px-4 py-3 font-medium">Added</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {storeLoading || staff === null ? (
              <TableRowSkeleton cols={4} />
            ) : staff.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No staff yet</td>
              </tr>
            ) : (
              staff.map((member) => (
                <tr key={member.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{member.firstName} {member.lastName}</p>
                    <p className="text-xs text-slate-400">{member.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(member.createdAt)}</td>
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

      <div className="bg-white border border-slate-200 rounded-sm p-5 max-w-md space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">Invite staff</p>
          <span className="text-xs text-slate-400">{staff?.length ?? 0} of {maxStaff}</span>
        </div>
        {atLimit ? (
          <p className="text-sm text-slate-500">
            You&apos;ve reached the {maxStaff}-staff limit{maxStaff <= 1 ? " on the free plan" : ""}. {maxStaff <= 1 ? (
              <>Upgrade to Storezn+ for more staff seats.</>
            ) : (
              "Remove someone before inviting another."
            )}
          </p>
        ) : (
          <form onSubmit={invite} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="First name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required />
              <Input label="Last name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required />
            </div>
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
            <Button type="submit" loading={inviting}>
              <UserPlus size={16} />
              Send invite
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
